import { Router } from 'express';
import { RULES } from '../config.js';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { checkEligibility, classifyCollection, expiryDate, parseDate, today } from '../utils/rules.js';
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
    const { vars, ...result } = checkEligibility({ dateOfBirth: req.user.date_of_birth, lastDonationDate: last?.last, bookingDate: date });
    res.json({ ...result, reason: result.reason && req.t(result.reason, vars), lastDonationDate: last?.last || null, date });
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
        throw new HttpError(422, eligibility.reason, { nextEligibleDate: eligibility.nextEligibleDate ?? null, vars: eligibility.vars });
    }

    // 5. Save as pending and tell the blood bank.
    const result = await query(
        `INSERT INTO appointments (donor_id, blood_bank_id, blood_type, units, appointment_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, bankId, req.user.blood_type, RULES.UNITS_PER_DONATION, date, cleanText(body.notes)]);
    await notify(bankId, {
        category: 'appointment',
        title: 'New donation booking',
        message: '{name} ({bloodType}) booked a donation for {date}.',
        vars: { name: req.user.name, bloodType: req.user.blood_type, date },
        senderId: req.user.id,
    });

    const [appointment] = await query('SELECT * FROM appointments WHERE id = ?', [result.insertId]);
    res.status(201).json({ appointment, message: req.t('Appointment booked at {bank} for {date}', { bank: bank.name, date }) });
}));

// Measured volume entered when a donation is verified (whole mL, 0 if nothing usable was collected).
function readVolume(value) {
    const volume = Number(value);
    if (value === undefined || value === null || value === '' || !Number.isInteger(volume) || volume < 0) {
        throw new HttpError(400, 'Enter the collected volume in whole millilitres (mL)');
    }
    if (classifyCollection(volume) === 'over_volume') {
        throw new HttpError(400,
            'Volumes above {max} mL are outside the accepted range for a {bag} mL bag. Check the measurement.',
            { vars: { max: RULES.STANDARD_MAX_ML, bag: RULES.BAG_VOLUME_ML } });
    }
    return volume;
}

router.patch('/:id/status', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const requested = req.body?.status;
    let reason = cleanText(req.body?.rejection_reason);
    let volume = null;
    let classification = null;
    let status = requested;

    const appointment = await withTransaction(async (q) => {
        const [appt] = await q('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
        if (!appt) throw new HttpError(404, 'Appointment not found');
        if (appt.blood_bank_id !== req.user.id) throw new HttpError(403, 'This appointment belongs to another blood bank');
        if (!(TRANSITIONS[appt.status] || []).includes(requested)) {
            throw new HttpError(409, 'An appointment cannot move from {from} to {to}', { vars: { from: appt.status, to: requested } });
        }

        if (requested === 'completed') {
            volume = readVolume(req.body?.volume_ml);
            classification = classifyCollection(volume);
            // An incomplete collection is never added to stock: the appointment is closed as rejected.
            if (classification === 'incomplete') status = 'rejected';
        }
        if (classification === 'incomplete') {
            reason = `Incomplete collection: ${volume} mL (a usable unit needs at least ${RULES.LOW_VOLUME_MIN_ML} mL)`;
        }
        await q('UPDATE appointments SET status = ?, rejection_reason = ?, collected_volume_ml = ? WHERE id = ?',
            [status, status === 'rejected' ? reason : null, volume, id]);

        let notice;
        if (status === 'completed') {
            // Donation verified: record it with its volume class and expiry date, and add the unit to stock.
            const donationDate = today();
            await q(
                `INSERT INTO donations (appointment_id, donor_id, blood_bank_id, blood_type, units, volume_ml, classification, donation_date, expiry_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, appt.donor_id, appt.blood_bank_id, appt.blood_type, appt.units, volume, classification,
                    donationDate, expiryDate(donationDate)]);
            await addToStock(q, appt.blood_bank_id, appt.blood_type, appt.units);
            await q('UPDATE users SET verified = 1 WHERE id = ?', [appt.donor_id]);
            notice = { title: 'Donation verified', message: 'Thank you! Your donation at {bank} was verified. Your certificate is ready to download.' };
        } else if (classification === 'incomplete') {
            notice = {
                title: 'Collection incomplete',
                message: 'Thank you for coming to {bank}. Only {volume} mL could be collected, which is not enough for a usable unit, so it was not recorded as a donation. You may book again.',
            };
        } else if (status === 'approved') {
            notice = { title: 'Appointment approved', message: 'Your donation appointment on {date} at {bank} was approved.' };
        } else {
            notice = {
                title: 'Appointment rejected',
                message: reason
                    ? 'Your donation appointment on {date} was not accepted. Reason: {reason}'
                    : 'Your donation appointment on {date} was not accepted.',
            };
        }

        await notify(appt.donor_id, {
            category: 'appointment',
            ...notice,
            vars: { bank: req.user.name, date: appt.appointment_date, volume, reason },
            senderId: req.user.id,
        }, q);

        const [updated] = await q('SELECT * FROM appointments WHERE id = ?', [id]);
        return updated;
    });

    const messages = {
        standard: 'Standard unit ({volume} mL) verified and added to stock',
        low_volume: 'Low-volume unit ({volume} mL) added to stock — use for red cells only',
        incomplete: 'Incomplete collection ({volume} mL) — not added to stock',
    };
    const message = messages[classification] || (status === 'approved' ? 'Appointment approved' : 'Appointment rejected');
    res.json({ appointment, classification, message: req.t(message, { volume }) });
}));

export default router;
