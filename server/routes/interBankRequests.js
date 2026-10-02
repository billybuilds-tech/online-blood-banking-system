import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { isBloodType } from '../utils/rules.js';
import { addToStock, takeFromStock } from '../utils/stock.js';
import { URGENCY, cleanText, requireUnits } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

const NEW_REQUEST_TITLE = {
    normal: 'Inter-bank blood request',
    urgent: 'URGENT inter-bank request',
    critical: 'CRITICAL inter-bank request',
};

// from_bank_id = bank asking for blood, to_bank_id = bank asked to supply it.
router.get('/', ah(async (req, res) => {
    const where = [];
    const params = [];
    if (req.user.role === 'bloodbank') {
        where.push('(r.from_bank_id = ? OR r.to_bank_id = ?)');
        params.push(req.user.id, req.user.id);
    } else if (req.user.role !== 'admin') {
        return res.json([]);
    }

    const rows = await query(
        `SELECT r.*, f.name AS from_bank_name, t.name AS to_bank_name
         FROM inter_bank_requests r
         JOIN users f ON f.id = r.from_bank_id
         JOIN users t ON t.id = r.to_bank_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY (r.status = 'pending') DESC, r.created_at DESC`,
        params);
    res.json(rows);
}));

router.post('/', requireRole('bloodbank'), ah(async (req, res) => {
    const body = req.body ?? {};
    const supplierId = parseId(body.to_bank_id);
    const urgency = body.urgency || 'normal';
    if (supplierId === req.user.id) throw new HttpError(400, 'Choose another blood bank');
    if (!isBloodType(body.blood_type)) throw new HttpError(400, 'Choose a valid blood type');
    if (!URGENCY.includes(urgency)) throw new HttpError(400, 'Urgency must be normal, urgent or critical');
    const units = requireUnits(body.units, 200);

    const [supplier] = await query("SELECT id, name FROM users WHERE id = ? AND role = 'bloodbank' AND status = 'approved'", [supplierId]);
    if (!supplier) throw new HttpError(400, 'Choose an approved blood bank');

    const result = await query(
        'INSERT INTO inter_bank_requests (from_bank_id, to_bank_id, blood_type, units, urgency, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, supplierId, body.blood_type, units, urgency, cleanText(body.notes)]);
    await notify(supplierId, {
        category: 'inter_bank',
        title: NEW_REQUEST_TITLE[urgency],
        message: '{name} asked for {units} unit(s) of {bloodType}.',
        vars: { name: req.user.name, units, bloodType: body.blood_type },
        senderId: req.user.id,
    });

    const [request] = await query('SELECT * FROM inter_bank_requests WHERE id = ?', [result.insertId]);
    res.status(201).json({ request, message: req.t('Request sent to {bank}', { bank: supplier.name }) });
}));

// Only the bank that was asked for blood (the supplier) can approve or reject.
router.patch('/:id/status', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = req.body ?? {};
    const reason = cleanText(req.body?.rejection_reason);
    if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'Status must be approved or rejected');

    const request = await withTransaction(async (q) => {
        const [row] = await q('SELECT * FROM inter_bank_requests WHERE id = ? FOR UPDATE', [id]);
        if (!row) throw new HttpError(404, 'Request not found');
        if (row.to_bank_id !== req.user.id) throw new HttpError(403, 'Only the bank asked to supply the blood can respond');
        if (row.status !== 'pending') throw new HttpError(409, 'This request is already {status}', { vars: { status: row.status } });

        if (status === 'approved') {
            // Units leave the supplier and arrive at the requester in one transaction.
            await takeFromStock(q, row.to_bank_id, row.blood_type, row.units);
            await addToStock(q, row.from_bank_id, row.blood_type, row.units);
        }
        await q('UPDATE inter_bank_requests SET status = ?, rejection_reason = ? WHERE id = ?',
            [status, status === 'rejected' ? reason : null, id]);

        let message;
        if (status === 'approved') {
            message = '{bank} transferred {units} unit(s) of {bloodType} to your stock.';
        } else {
            message = reason
                ? '{bank} declined your request for {units} unit(s) of {bloodType}. Reason: {reason}'
                : '{bank} declined your request for {units} unit(s) of {bloodType}.';
        }
        await notify(row.from_bank_id, {
            category: 'inter_bank',
            title: status === 'approved' ? 'Inter-bank request approved' : 'Inter-bank request rejected',
            message,
            vars: { bank: req.user.name, units: row.units, bloodType: row.blood_type, reason },
            senderId: req.user.id,
        }, q);

        const [updated] = await q('SELECT * FROM inter_bank_requests WHERE id = ?', [id]);
        return updated;
    });

    res.json({ request, message: req.t(status === 'approved' ? 'Request approved' : 'Request rejected') });
}));

export default router;
