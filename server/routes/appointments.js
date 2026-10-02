import { Router } from 'express';
import { RULES } from '../config.js';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { checkEligibility, expiryDate, parseDate, today } from '../utils/rules.js';
import { addToStock } from '../utils/stock.js';
import { cleanText } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

// Allowed status changes (Section 4.5). Anything else is refused.
const TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['completed', 'rejected'],
};

router.get('/', ah(async (req, res) => {
    const where = [];
    const params = [];
    if (req.user.role === 'donor') { where.push('a.donor_id = ?'); params.push(req.user.id); }
    else if (req.user.role === 'bloodbank') { where.push('a.blood_bank_id = ?'); params.push(req.user.id); }
    else if (req.user.role !== 'admin') return res.json([]);

    const rows = await query(
        `SELECT a.*, d.name AS donor_name, d.phone AS donor_phone, d.date_of_birth AS donor_dob,
                b.name AS bank_name, b.region AS bank_region
         FROM appointments a
         JOIN users d ON d.id = a.donor_id
         JOIN users b ON b.id = a.blood_bank_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY a.appointment_date DESC, a.id DESC`,
        params);
    res.json(rows);
}));

// Donor eligibility for a given date, so the booking form can warn before submitting.
router.get('/eligibility', requireRole('donor'), ah(async (req, res) => {
    const date = parseDate(req.query.date) ? req.query.date : today();
    const [last] = await query('SELECT MAX(donation_date) AS last FROM donations WHERE donor_id = ?', [req.user.id]);
    const result = checkEligibility({ dateOfBirth: req.user.date_of_birth, lastDonationDate: last?.last, bookingDate: date });
    res.json({ ...result, lastDonationDate: last?.last || null, date });
}));

router.post('/', requireRole('donor'), ah(async (req, res) => {
    const body = req.body ?? {};
    const date = body.appointment_date;
    const bankId = parseId(body.blood_bank_id);

    // 1. Date must not be in the past; bank must be approved.
    if (!parseDate(date)) throw new HttpError(400, 'Choose a valid appointment date');
    if (date < today()) throw new HttpError(400, 'The appointment date cannot be in the past');
    const [bank] = await query("SELECT id, name FROM users WHERE id = ? AND role = 'bloodbank' AND status = 'approved'", [bankId]);
    if (!bank) throw new HttpError(400, 'Choose an approved blood bank');
    if (!req.user.blood_type) throw new HttpError(400, 'Add your blood type to your profile before booking');

    // 2. Only one open appointment at a time.
    const open = await query("SELECT id FROM appointments WHERE donor_id = ? AND status IN ('pending', 'approved')", [req.user.id]);
    if (open.length) throw new HttpError(409, 'You already have an open appointment. Wait until it is completed or rejected.');

    // 3 and 4. Age limits and interval since the last verified donation.
    const [last] = await query('SELECT MAX(donation_date) AS last FROM donations WHERE donor_id = ?', [req.user.id]);
    const eligibility = checkEligibility({
        dateOfBirth: req.user.date_of_birth,
        lastDonationDate: last?.last,
        bookingDate: date,
    });
    if (!eligibility.eligible) {
        throw new HttpError(422, eligibility.reason, { nextEligibleDate: eligibility.nextEligibleDate ?? null });
    }

    // 5. Save as pending and tell the blood bank.
    const result = await query(
        `INSERT INTO appointments (donor_id, blood_bank_id, blood_type, units, appointment_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, bankId, req.user.blood_type, RULES.UNITS_PER_DONATION, date, cleanText(body.notes)]);
    await notify(bankId, {
        category: 'appointment',
        title: 'New donation booking',
        message: `${req.user.name} (${req.user.blood_type}) booked a donation for ${date}.`,
        senderId: req.user.id,
    });

    const [appointment] = await query('SELECT * FROM appointments WHERE id = ?', [result.insertId]);
    res.status(201).json({ appointment, message: `Appointment booked at ${bank.name} for ${date}` });
}));

router.patch('/:id/status', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = req.body ?? {};
    const reason = cleanText(req.body?.rejection_reason);

    const appointment = await withTransaction(async (q) => {
        const [appt] = await q('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
        if (!appt) throw new HttpError(404, 'Appointment not found');
        if (appt.blood_bank_id !== req.user.id) throw new HttpError(403, 'This appointment belongs to another blood bank');
        if (!(TRANSITIONS[appt.status] || []).includes(status)) {
            throw new HttpError(409, `An appointment cannot move from ${appt.status} to ${status}`);
        }

        await q('UPDATE appointments SET status = ?, rejection_reason = ? WHERE id = ?',
            [status, status === 'rejected' ? reason : null, id]);

        let message;
        if (status === 'completed') {
            // Donation verified: record it with its expiry date and add the units to stock.
            const donationDate = today();
            await q(
                `INSERT INTO donations (appointment_id, donor_id, blood_bank_id, blood_type, units, donation_date, expiry_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, appt.donor_id, appt.blood_bank_id, appt.blood_type, appt.units, donationDate, expiryDate(donationDate)]);
            await addToStock(q, appt.blood_bank_id, appt.blood_type, appt.units);
            await q('UPDATE users SET verified = 1 WHERE id = ?', [appt.donor_id]);
            message = `Thank you! Your donation at ${req.user.name} was verified. Your certificate is ready to download.`;
        } else if (status === 'approved') {
            message = `Your donation appointment on ${appt.appointment_date} at ${req.user.name} was approved.`;
        } else {
            message = `Your donation appointment on ${appt.appointment_date} was not accepted.${reason ? ` Reason: ${reason}` : ''}`;
        }

        await notify(appt.donor_id, {
            category: 'appointment',
            title: `Appointment ${status}`,
            message,
            senderId: req.user.id,
        }, q);

        const [updated] = await q('SELECT * FROM appointments WHERE id = ?', [id]);
        return updated;
    });

    res.json({ appointment, message: `Appointment ${status}` });
}));

export default router;
