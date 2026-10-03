import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { isBloodType, unitNumber } from '../utils/rules.js';
import { compatibleInStock, issueUnits } from '../utils/stock.js';
import { URGENCY, cleanText, requireUnits } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

const NEW_REQUEST_TITLE = {
    normal: 'New blood request',
    urgent: 'URGENT blood request',
    critical: 'CRITICAL blood request',
};

/*
 * Queue order for pending requests: clinical urgency first; within the same urgency, requests
 * from people who have donated blood (at least one verified donation) come first; then oldest
 * first. Being a donor never moves a request ahead of a more urgent one.
 */
router.get('/', ah(async (req, res) => {
    const where = [];
    const params = [];
    if (req.user.role === 'recipient' || req.user.role === 'donor') { where.push('r.recipient_id = ?'); params.push(req.user.id); }
    else if (req.user.role === 'bloodbank') { where.push('r.blood_bank_id = ?'); params.push(req.user.id); }
    else if (req.user.role !== 'admin') return res.json([]);

    const rows = await query(
        `SELECT r.*, p.name AS recipient_name, p.phone AS recipient_phone, p.role AS requester_role,
                COALESCE(dc.donations, 0) AS requester_donations,
                b.name AS bank_name, b.region AS bank_region,
                (SELECT GROUP_CONCAT(u.id ORDER BY u.id) FROM blood_units u WHERE u.blood_request_id = r.id) AS unit_ids
         FROM blood_requests r
         JOIN users p ON p.id = r.recipient_id
         JOIN users b ON b.id = r.blood_bank_id
         LEFT JOIN (SELECT donor_id, COUNT(*) AS donations FROM donations GROUP BY donor_id) dc ON dc.donor_id = r.recipient_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY (r.status = 'pending') DESC,
                  CASE WHEN r.status = 'pending' THEN FIELD(r.urgency, 'critical', 'urgent', 'normal') END,
                  CASE WHEN r.status = 'pending' THEN COALESCE(dc.donations, 0) > 0 END DESC,
                  CASE WHEN r.status = 'pending' THEN r.created_at END ASC,
                  r.updated_at DESC`,
        params);
    res.json(rows.map(({ unit_ids, ...r }) => ({
        ...r,
        requester_donations: Number(r.requester_donations),
        unit_numbers: unit_ids ? unit_ids.split(',').map(unitNumber) : [],
    })));
}));

// Recipients, and donors who need blood themselves, request from the same account.
router.post('/', requireRole('recipient', 'donor'), ah(async (req, res) => {
    const body = req.body ?? {};
    const bankId = parseId(body.blood_bank_id);
    const bloodType = body.blood_type || req.user.blood_type;
    const urgency = body.urgency || 'normal';
    if (!isBloodType(bloodType)) throw new HttpError(400, 'Choose a valid blood type');
    if (!URGENCY.includes(urgency)) throw new HttpError(400, 'Urgency must be normal, urgent or critical');
    const units = requireUnits(body.units);

    const [bank] = await query("SELECT id, name FROM users WHERE id = ? AND role = 'bloodbank' AND status = 'approved'", [bankId]);
    if (!bank) throw new HttpError(400, 'Choose an approved blood bank');

    const result = await query(
        'INSERT INTO blood_requests (recipient_id, blood_bank_id, blood_type, units, urgency, reason) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, bankId, bloodType, units, urgency, cleanText(body.reason)]);
    const [{ donations }] = await query('SELECT COUNT(*) AS donations FROM donations WHERE donor_id = ?', [req.user.id]);
    await notify(bankId, {
        category: urgency === 'normal' ? 'request' : 'urgent_request',
        title: NEW_REQUEST_TITLE[urgency],
        message: donations > 0
            ? '{name} (blood donor, {count} donation(s)) requested {units} unit(s) of {bloodType}.'
            : '{name} requested {units} unit(s) of {bloodType}.',
        vars: { name: req.user.name, units, bloodType, count: Number(donations) },
        senderId: req.user.id,
    });

    const [request] = await query('SELECT * FROM blood_requests WHERE id = ?', [result.insertId]);
    res.status(201).json({ request, message: req.t('Request sent to {bank}', { bank: bank.name }) });
}));

router.patch('/:id/status', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = req.body ?? {};
    const reason = cleanText(req.body?.rejection_reason);
    if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'Status must be approved or rejected');

    let current;
    try {
        const request = await withTransaction(async (q) => {
            const [row] = await q('SELECT * FROM blood_requests WHERE id = ? FOR UPDATE', [id]);
            current = row;
            if (!row) throw new HttpError(404, 'Request not found');
            if (row.blood_bank_id !== req.user.id) throw new HttpError(403, 'This request was sent to another blood bank');
            if (row.status !== 'pending') throw new HttpError(409, 'This request is already {status}', { vars: { status: row.status } });

            if (status === 'approved') await issueUnits(q, req.user.id, row.blood_type, row.units, id);
            await q('UPDATE blood_requests SET status = ?, rejection_reason = ? WHERE id = ?',
                [status, status === 'rejected' ? reason : null, id]);

            let message;
            if (status === 'approved') {
                message = '{bank} approved your request for {units} unit(s) of {bloodType}. Please contact the bank to arrange collection.';
            } else {
                message = reason
                    ? '{bank} could not approve your request for {units} unit(s) of {bloodType}. Reason: {reason}'
                    : '{bank} could not approve your request for {units} unit(s) of {bloodType}.';
            }
            await notify(row.recipient_id, {
                category: 'request',
                title: status === 'approved' ? 'Blood request approved' : 'Blood request rejected',
                message,
                vars: { bank: req.user.name, units: row.units, bloodType: row.blood_type, reason },
                senderId: req.user.id,
            }, q);

            const [updated] = await q('SELECT * FROM blood_requests WHERE id = ?', [id]);
            return updated;
        });
        res.json({ request, message: req.t(status === 'approved' ? 'Request approved' : 'Request rejected') });
    } catch (err) {
        // Not enough units: show the bank which compatible groups it holds instead.
        if (err instanceof HttpError && err.details?.shortage && current) {
            err.details.alternatives = await compatibleInStock(query, req.user.id, current.blood_type);
        }
        throw err;
    }
}));

export default router;
