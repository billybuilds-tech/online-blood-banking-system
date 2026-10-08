import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { isBloodType, unitNumber } from '../utils/rules.js';
import { compatibleInStock, issueUnits } from '../utils/stock.js';
import { INDICATIONS, URGENCY, cleanText, phoneNumber, requireUnits } from '../utils/validate.js';

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

/*
 * Recipients, and donors who need blood themselves, request from the same account. Blood is asked
 * for a patient who is in hospital, on a doctor's advice: the request names the patient, hospital,
 * ward and doctor, and the requester declares that a doctor asked for the blood. The bank calls the
 * doctor or the hospital to confirm before approving, and the blood goes to the hospital.
 */
router.post('/', requireRole('recipient', 'donor'), ah(async (req, res) => {
    const body = req.body ?? {};
    const bankId = parseId(body.blood_bank_id);
    const bloodType = body.blood_type || req.user.blood_type;
    const urgency = body.urgency || 'normal';
    if (!isBloodType(bloodType)) throw new HttpError(400, 'Choose a valid blood type');
    if (!URGENCY.includes(urgency)) throw new HttpError(400, 'Urgency must be normal, urgent or critical');
    const units = requireUnits(body.units);

    const patient = cleanText(body.patient_name, 120);
    const hospital = cleanText(body.hospital, 150);
    const ward = cleanText(body.ward, 80);
    const doctor = cleanText(body.doctor_name, 120);
    const doctorPhone = phoneNumber(body.doctor_phone);
    if (!patient || !hospital || !ward) throw new HttpError(400, "Enter the patient's name, the hospital and the ward");
    if (!INDICATIONS.includes(body.indication)) throw new HttpError(400, 'Choose why the patient needs blood');
    if (!doctor || !doctorPhone) throw new HttpError(400, 'Enter the name and phone number of the doctor who asked for the blood');
    if (body.doctor_declaration !== true) {
        throw new HttpError(400, 'Confirm that a doctor asked for this blood for a patient in this hospital');
    }

    const [bank] = await query("SELECT id, name FROM users WHERE id = ? AND role = 'bloodbank' AND status = 'approved'", [bankId]);
    if (!bank) throw new HttpError(400, 'Choose an approved blood bank');

    const result = await query(
        `INSERT INTO blood_requests (recipient_id, blood_bank_id, blood_type, units, urgency, reason,
                                     patient_name, hospital, ward, indication, doctor_name, doctor_reg_no, doctor_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, bankId, bloodType, units, urgency, cleanText(body.reason),
            patient, hospital, ward, body.indication, doctor, cleanText(body.doctor_reg_no, 40), doctorPhone]);
    const [{ donations }] = await query('SELECT COUNT(*) AS donations FROM donations WHERE donor_id = ?', [req.user.id]);
    await notify(bankId, {
        category: urgency === 'normal' ? 'request' : 'urgent_request',
        title: NEW_REQUEST_TITLE[urgency],
        message: donations > 0
            ? '{name} (blood donor, {count} donation(s)) requested {units} unit(s) of {bloodType} for a patient at {hospital}.'
            : '{name} requested {units} unit(s) of {bloodType} for a patient at {hospital}.',
        vars: { name: req.user.name, units, bloodType, count: Number(donations), hospital },
        senderId: req.user.id,
    });
    await audit(req, 'request.created', {
        entityType: 'blood_request', entityId: result.insertId, details: { units, bloodType, bank: bank.name, urgency, hospital, doctor },
    });

    const [request] = await query('SELECT * FROM blood_requests WHERE id = ?', [result.insertId]);
    res.status(201).json({ request, message: req.t('Request sent to {bank}', { bank: bank.name }) });
}));

router.patch('/:id/status', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = req.body ?? {};
    const reason = cleanText(req.body?.rejection_reason);
    const confirmedWith = cleanText(req.body?.confirmed_with, 120);
    if (!['approved', 'rejected'].includes(status)) throw new HttpError(400, 'Status must be approved or rejected');
    // Blood is issued only after the bank has confirmed the request with the doctor or the hospital.
    if (status === 'approved' && !confirmedWith) {
        throw new HttpError(400, 'Confirm the request with the doctor or the hospital, then enter who confirmed it');
    }

    let current;
    try {
        const request = await withTransaction(async (q) => {
            const [row] = await q('SELECT * FROM blood_requests WHERE id = ? FOR UPDATE', [id]);
            current = row;
            if (!row) throw new HttpError(404, 'Request not found');
            if (row.blood_bank_id !== req.user.id) throw new HttpError(403, 'This request was sent to another blood bank');
            if (row.status !== 'pending') throw new HttpError(409, 'This request is already {status}', { vars: { status: row.status } });

            const bags = status === 'approved' ? await issueUnits(q, req.user.id, row.blood_type, row.units, id) : [];
            // An approved request then goes through the delivery steps, starting with 'preparing'.
            const approved = status === 'approved';
            await q(
                `UPDATE blood_requests SET status = ?, rejection_reason = ?, confirmed_with = ?, confirmed_at = IF(?, NOW(), NULL),
                                           decided_at = NOW(), delivery_status = ? WHERE id = ?`,
                [status, approved ? null : reason, approved ? confirmedWith : null, approved, approved ? 'preparing' : null, id]);
            const [requester] = await q('SELECT id, name FROM users WHERE id = ?', [row.recipient_id]);
            await audit(req, `request.${status}`, {
                entityType: 'blood_request', entityId: id, subject: requester,
                details: { name: requester.name, units: row.units, bloodType: row.blood_type, bags: bags.map(unitNumber).join(', '), confirmedWith },
            }, q);

            let message;
            if (status === 'approved') {
                message = '{bank} approved your request for {units} unit(s) of {bloodType}. The bank is preparing the blood; you will be told when it is ready for collection or on its way.';
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

/*
 * Delivery steps after approval (like LifeBank in Nigeria):
 *   preparing -> ready (for collection at the bank) -> received
 *   preparing -> dispatched (with a courier)        -> received
 * The bank records each step; the person who asked for the blood can also confirm receipt.
 */
const NEXT_STEPS = {
    preparing: ['ready', 'dispatched'],
    ready: ['received'],
    dispatched: ['received'],
};

const DELIVERY_NOTICE = {
    ready: {
        title: 'Blood ready for collection',
        message: '{units} unit(s) of {bloodType} are ready for collection at {bank}.',
    },
    dispatched: {
        title: 'Blood on the way',
        message: '{bank} has sent {units} unit(s) of {bloodType} with {courier} ({phone}).',
    },
};

router.patch('/:id/delivery', requireRole('bloodbank', 'recipient', 'donor'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const step = req.body?.step;
    const courier = cleanText(req.body?.courier_name, 120);
    const phone = step === 'dispatched' ? phoneNumber(req.body?.courier_phone) : null;
    if (!['ready', 'dispatched', 'received'].includes(step)) throw new HttpError(400, 'Step must be ready, dispatched or received');
    if (step === 'dispatched' && (!courier || !phone)) throw new HttpError(400, "Enter the courier's name and phone number");

    const request = await withTransaction(async (q) => {
        const [row] = await q('SELECT * FROM blood_requests WHERE id = ? FOR UPDATE', [id]);
        if (!row) throw new HttpError(404, 'Request not found');
        const isBank = req.user.role === 'bloodbank' && row.blood_bank_id === req.user.id;
        const isRequester = row.recipient_id === req.user.id;
        // The requester may only confirm receipt; every other step is the bank's.
        if (!isBank && !(isRequester && step === 'received')) throw new HttpError(403, 'You cannot update the delivery of this request');
        if (row.status !== 'approved' || !(NEXT_STEPS[row.delivery_status] || []).includes(step)) {
            throw new HttpError(409, 'This step is not possible now');
        }

        const [bank] = await q('SELECT id, name FROM users WHERE id = ?', [row.blood_bank_id]);
        const [requester] = await q('SELECT id, name FROM users WHERE id = ?', [row.recipient_id]);
        const vars = { bank: bank.name, name: requester.name, units: row.units, bloodType: row.blood_type, courier, phone };
        if (step === 'ready') {
            await q("UPDATE blood_requests SET delivery_status = 'ready', ready_at = NOW() WHERE id = ?", [id]);
        } else if (step === 'dispatched') {
            await q("UPDATE blood_requests SET delivery_status = 'dispatched', dispatched_at = NOW(), courier_name = ?, courier_phone = ? WHERE id = ?",
                [courier, phone, id]);
        } else {
            await q("UPDATE blood_requests SET delivery_status = 'received', received_at = NOW(), received_confirmed_by = ? WHERE id = ?",
                [isRequester ? 'recipient' : 'bank', id]);
        }

        if (step === 'received') {
            // Whoever did not record the receipt is told about it.
            await notify(isRequester ? row.blood_bank_id : row.recipient_id, isRequester
                ? { category: 'request', title: 'Blood received', message: '{name} confirmed receiving {units} unit(s) of {bloodType}.', vars, senderId: req.user.id }
                : { category: 'request', title: 'Blood handed over', message: '{bank} recorded that you received {units} unit(s) of {bloodType}.', vars, senderId: req.user.id },
            q);
        } else {
            await notify(row.recipient_id, { category: 'request', ...DELIVERY_NOTICE[step], vars, senderId: req.user.id }, q);
        }
        await audit(req, `request.${step}`, {
            entityType: 'blood_request', entityId: id, subject: isRequester ? bank : requester,
            details: { name: requester.name, bank: bank.name, units: row.units, bloodType: row.blood_type, courier },
        }, q);

        const [updated] = await q('SELECT * FROM blood_requests WHERE id = ?', [id]);
        return updated;
    });

    const messages = {
        ready: 'Marked as ready for collection',
        dispatched: 'Marked as on the way',
        received: 'Receipt recorded',
    };
    res.json({ request, message: req.t(messages[step]) });
}));

export default router;
