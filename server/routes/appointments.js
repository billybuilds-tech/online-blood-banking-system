import { Router } from 'express';
import { RULES, SCREENING_LIMITS } from '../config.js';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { donorEligibility } from '../utils/donorStatus.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { badgeReachedAt } from '../utils/recognition.js';
import { addDays, classifyCollection, expiryDate, isBloodType, parseDate, today } from '../utils/rules.js';
import {
    DEFERRAL_REASONS, DEFERRAL_REASON_LABELS, QUESTIONS, QUESTION_VARS, SCREENING_FIELDS,
    evaluateQuestionnaire, evaluateScreening,
} from '../utils/screening.js';
import { addToStock } from '../utils/stock.js';
import { cleanText } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

// Allowed status changes (Section 4.5). Anything else is refused.
const TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['completed', 'rejected', 'deferred'],
};

const SCREENING_FIELD_LABELS = {
    weight_kg: 'Weight (kg)',
    hemoglobin_g_dl: 'Haemoglobin (g/dL)',
    bp_systolic: 'Blood pressure, systolic (mmHg)',
    bp_diastolic: 'Blood pressure, diastolic (mmHg)',
    pulse_bpm: 'Pulse (beats per minute)',
    temperature_c: 'Temperature (°C)',
};

function parseJson(value) {
    if (typeof value !== 'string') return value ?? null;
    try { return JSON.parse(value); } catch { return null; }
}

router.get('/', ah(async (req, res) => {
    const where = [];
    const params = [];
    if (req.user.role === 'donor') { where.push('a.donor_id = ?'); params.push(req.user.id); }
    else if (req.user.role === 'bloodbank') { where.push('a.blood_bank_id = ?'); params.push(req.user.id); }
    else if (req.user.role !== 'admin') return res.json([]);

    const rows = await query(
        `SELECT a.*, d.name AS donor_name, d.phone AS donor_phone, d.date_of_birth AS donor_dob,
                d.blood_type_confirmed_at AS donor_group_confirmed_at,
                b.name AS bank_name, b.region AS bank_region,
                df.reason AS deferral_reason, df.deferred_until
         FROM appointments a
         JOIN users d ON d.id = a.donor_id
         JOIN users b ON b.id = a.blood_bank_id
         LEFT JOIN deferrals df ON df.appointment_id = a.id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY a.appointment_date DESC, a.id DESC`,
        params);
    res.json(rows.map((r) => ({ ...r, questionnaire: parseJson(r.questionnaire), screening: parseJson(r.screening) })));
}));

// Health questions for the booking form and limits for the donation-day check, in the caller's language.
router.get('/screening', (req, res) => {
    res.json({
        questions: QUESTIONS.map((q) => ({ id: q.id, text: req.t(q.text, QUESTION_VARS), expected: q.expected })),
        limits: SCREENING_LIMITS,
        fields: Object.entries(SCREENING_FIELDS).map(([id, range]) => ({ id, range, label: req.t(SCREENING_FIELD_LABELS[id]) })),
        reasons: DEFERRAL_REASONS.map((code) => ({ code, label: req.t(DEFERRAL_REASON_LABELS[code]) })),
    });
});

// Donor eligibility for a given date, so the booking form can warn before submitting.
router.get('/eligibility', requireRole('donor'), ah(async (req, res) => {
    const date = parseDate(req.query.date) ? req.query.date : today();
    const { vars, ...result } = await donorEligibility(req.user, date);
    res.json({ ...result, reason: result.reason && req.t(result.reason, vars), date });
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

    // A booking may answer an active appeal this donor received from the same bank.
    let appealId = null;
    if (body.appeal_id !== undefined && body.appeal_id !== null && body.appeal_id !== '') {
        appealId = parseId(body.appeal_id);
        const [appeal] = await query(
            `SELECT a.id FROM donor_appeals a
             JOIN appeal_recipients r ON r.appeal_id = a.id AND r.donor_id = ?
             WHERE a.id = ? AND a.blood_bank_id = ? AND a.status = 'active' AND a.expires_at >= ?`,
            [req.user.id, appealId, bankId, today()]);
        if (!appeal) throw new HttpError(400, 'This appeal is no longer active');
    }

    // 2. Only one open appointment at a time.
    const open = await query("SELECT id FROM appointments WHERE donor_id = ? AND status IN ('pending', 'approved')", [req.user.id]);
    if (open.length) throw new HttpError(409, 'You already have an open appointment. Wait until it is completed or rejected.');

    // 3 and 4. Age limits, interval since the last verified donation, and health-check deferrals.
    const eligibility = await donorEligibility(req.user, date);
    if (!eligibility.eligible) {
        throw new HttpError(422, eligibility.reason, { nextEligibleDate: eligibility.nextEligibleDate ?? null, vars: eligibility.vars });
    }

    // 5. Health questionnaire: an answer that shows a reason not to donate stops the booking.
    const { complete, failed } = evaluateQuestionnaire(body.questionnaire);
    if (!complete) throw new HttpError(400, 'Please answer all the health questions');
    if (failed.length) {
        throw new HttpError(422, 'Based on your answers you should not donate at this time.', {
            failedQuestions: failed.map((qid) => ({ id: qid, advice: req.t(QUESTIONS.find((q) => q.id === qid).advice, QUESTION_VARS) })),
        });
    }
    const answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, body.questionnaire[q.id]]));

    // 6. Save as pending and tell the blood bank.
    const result = await query(
        `INSERT INTO appointments (donor_id, blood_bank_id, blood_type, units, appointment_date, notes, questionnaire, appeal_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, bankId, req.user.blood_type, RULES.UNITS_PER_DONATION, date, cleanText(body.notes), JSON.stringify(answers), appealId]);
    await notify(bankId, {
        category: 'appointment',
        title: 'New donation booking',
        message: appealId
            ? '{name} ({bloodType}) booked a donation for {date} in answer to your appeal.'
            : '{name} ({bloodType}) booked a donation for {date}.',
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

// Donation-day health check values; required before collecting, optional when deferring.
function readScreening(req, raw, required) {
    if (raw === undefined || raw === null) {
        if (required) throw new HttpError(400, 'Record the health check before collecting blood');
        return null;
    }
    const values = {};
    for (const [field, [min, max]] of Object.entries(SCREENING_FIELDS)) {
        const value = Number(raw[field]);
        if (raw[field] === '' || raw[field] === null || !Number.isFinite(value) || value < min || value > max) {
            throw new HttpError(400, 'Enter a valid value for {field}', { vars: { field: req.t(SCREENING_FIELD_LABELS[field]) } });
        }
        values[field] = value;
    }
    return values;
}

router.patch('/:id/status', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const body = req.body ?? {};
    const requested = body.status;
    let reason = cleanText(body.rejection_reason);
    let volume = null;
    let classification = null;
    let status = requested;
    let deferredUntil = null;

    const appointment = await withTransaction(async (q) => {
        const [appt] = await q('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
        if (!appt) throw new HttpError(404, 'Appointment not found');
        if (appt.blood_bank_id !== req.user.id) throw new HttpError(403, 'This appointment belongs to another blood bank');
        if (!(TRANSITIONS[appt.status] || []).includes(requested)) {
            throw new HttpError(409, 'An appointment cannot move from {from} to {to}', { vars: { from: appt.status, to: requested } });
        }
        const [donor] = await q('SELECT id, blood_type, blood_type_confirmed_at FROM users WHERE id = ?', [appt.donor_id]);
        const vars = { bank: req.user.name, date: appt.appointment_date };
        let notice;

        if (requested === 'deferred') {
            // Health check not passed: record the deferral and close the appointment.
            if (!DEFERRAL_REASONS.includes(body.reason)) throw new HttpError(400, 'Choose a reason for the deferral');
            const permanent = body.permanent === true;
            const days = Number(body.deferral_days);
            if (!permanent && (!Number.isInteger(days) || days < 1 || days > 3650)) {
                throw new HttpError(400, 'Enter how many days the deferral lasts (1 to 3650)');
            }
            deferredUntil = permanent ? null : addDays(today(), days);
            const screening = readScreening(req, body.screening, false);
            await q(
                'INSERT INTO deferrals (donor_id, blood_bank_id, appointment_id, reason, notes, deferred_until) VALUES (?, ?, ?, ?, ?, ?)',
                [appt.donor_id, req.user.id, id, body.reason, cleanText(body.notes), deferredUntil]);
            await q("UPDATE appointments SET status = 'deferred', screening = ? WHERE id = ?",
                [screening ? JSON.stringify(screening) : null, id]);
            notice = {
                title: 'Donation deferred',
                message: permanent
                    ? 'After the health check at {bank} you are not able to donate blood at present. Reason: {reason}. Please talk to the blood bank for advice.'
                    : 'After the health check at {bank} please wait before donating again. Reason: {reason}. You may donate again from {until}.',
            };
            Object.assign(vars, { reason: DEFERRAL_REASON_LABELS[body.reason], until: deferredUntil });
        } else if (requested === 'completed') {
            // The health check must pass before blood is collected.
            const screening = readScreening(req, body.screening, true);
            const failedChecks = evaluateScreening(screening);
            if (failedChecks.length) {
                throw new HttpError(422, 'The health check did not pass ({checks}). Defer the donor instead of collecting blood.', {
                    failedChecks,
                    vars: { checks: failedChecks.map((c) => req.t(DEFERRAL_REASON_LABELS[c])).join(', ') },
                });
            }
            const confirmedType = body.blood_type ?? appt.blood_type;
            if (!isBloodType(confirmedType)) throw new HttpError(400, 'Choose the blood group confirmed by the grouping test');

            volume = readVolume(body.volume_ml);
            classification = classifyCollection(volume);
            // An incomplete collection is never added to stock: the appointment is closed as rejected.
            if (classification === 'incomplete') {
                status = 'rejected';
                reason = `Incomplete collection: ${volume} mL (a usable unit needs at least ${RULES.LOW_VOLUME_MIN_ML} mL)`;
            }
            await q('UPDATE appointments SET status = ?, rejection_reason = ?, collected_volume_ml = ?, screening = ?, blood_type = ? WHERE id = ?',
                [status, status === 'rejected' ? reason : null, volume, JSON.stringify(screening),
                    status === 'completed' ? confirmedType : appt.blood_type, id]);

            if (status === 'completed') {
                // Donation verified: record it with its volume class and expiry date, add the unit to stock,
                // and record the blood group confirmed by the grouping test.
                const donationDate = today();
                await q(
                    `INSERT INTO donations (appointment_id, donor_id, blood_bank_id, blood_type, units, volume_ml, classification, donation_date, expiry_date)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, appt.donor_id, appt.blood_bank_id, confirmedType, appt.units, volume, classification,
                        donationDate, expiryDate(donationDate)]);
                await addToStock(q, appt.blood_bank_id, confirmedType, appt.units);
                await q(
                    'UPDATE users SET verified = 1, blood_type = ?, blood_type_confirmed_at = NOW(), blood_type_confirmed_by = ? WHERE id = ?',
                    [confirmedType, req.user.id, appt.donor_id]);

                if (donor.blood_type !== confirmedType) {
                    await notify(appt.donor_id, {
                        category: 'blood_group',
                        title: 'Blood group corrected',
                        message: 'The grouping test at {bank} shows your blood group is {newType} (you had entered {oldType}). Your profile has been updated.',
                        vars: { bank: req.user.name, newType: confirmedType, oldType: donor.blood_type },
                        senderId: req.user.id,
                    }, q);
                } else if (!donor.blood_type_confirmed_at) {
                    await notify(appt.donor_id, {
                        category: 'blood_group',
                        title: 'Blood group confirmed',
                        message: 'The grouping test at {bank} confirmed your blood group as {newType}.',
                        vars: { bank: req.user.name, newType: confirmedType },
                        senderId: req.user.id,
                    }, q);
                }
                const [{ total }] = await q('SELECT COUNT(*) AS total FROM donations WHERE donor_id = ?', [appt.donor_id]);
                const badge = badgeReachedAt(Number(total));
                if (badge) {
                    await notify(appt.donor_id, {
                        category: 'badge',
                        title: 'New badge: {badge}',
                        message: 'You have made {count} verified donation(s) and earned the {badge} badge. Thank you for saving lives!',
                        vars: { badge: badge.label, count: Number(total) },
                        senderId: req.user.id,
                    }, q);
                }
                notice = { title: 'Donation verified', message: 'Thank you! Your donation at {bank} was verified. Your certificate is ready to download.' };
            } else {
                notice = {
                    title: 'Collection incomplete',
                    message: 'Thank you for coming to {bank}. Only {volume} mL could be collected, which is not enough for a usable unit, so it was not recorded as a donation. You may book again.',
                };
                vars.volume = volume;
            }
        } else {
            await q('UPDATE appointments SET status = ?, rejection_reason = ? WHERE id = ?',
                [status, status === 'rejected' ? reason : null, id]);
            if (status === 'approved') {
                notice = { title: 'Appointment approved', message: 'Your donation appointment on {date} at {bank} was approved.' };
            } else {
                notice = {
                    title: 'Appointment rejected',
                    message: reason
                        ? 'Your donation appointment on {date} was not accepted. Reason: {reason}'
                        : 'Your donation appointment on {date} was not accepted.',
                };
                vars.reason = reason;
            }
        }

        await notify(appt.donor_id, { category: 'appointment', ...notice, vars, senderId: req.user.id }, q);

        const [updated] = await q('SELECT * FROM appointments WHERE id = ?', [id]);
        return updated;
    });

    let message;
    if (requested === 'deferred') {
        message = deferredUntil ? req.t('Donor deferred until {date}', { date: deferredUntil }) : req.t('Donor deferred permanently');
    } else {
        const messages = {
            standard: 'Standard unit ({volume} mL) verified and added to stock',
            low_volume: 'Low-volume unit ({volume} mL) added to stock — use for red cells only',
            incomplete: 'Incomplete collection ({volume} mL) — not added to stock',
        };
        message = req.t(messages[classification] || (status === 'approved' ? 'Appointment approved' : 'Appointment rejected'), { volume });
    }
    res.json({ appointment: { ...appointment, screening: parseJson(appointment.screening) }, classification, message });
}));

export default router;
