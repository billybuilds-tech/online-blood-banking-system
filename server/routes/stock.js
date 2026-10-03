import { Router } from 'express';
import { RULES } from '../config.js';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { BLOOD_TYPES, addDays, compatibleDonorTypes, expiryDate, expiryState, isBloodType, parseDate, today, unitNumber } from '../utils/rules.js';
import { DISCARD_REASONS, DISCARD_REASON_LABELS, addUnits, discardUnit } from '../utils/stock.js';
import { cleanText } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

// Stock of every approved bank (optionally one bank or one group), with the bags that expire soon.
router.get('/', ah(async (req, res) => {
    const where = ["b.status = 'approved'"];
    const params = [];
    if (req.query.bankId) { where.push('s.blood_bank_id = ?'); params.push(parseId(req.query.bankId)); }
    if (req.query.bloodType) {
        if (!isBloodType(req.query.bloodType)) throw new HttpError(400, 'Invalid blood type');
        where.push('s.blood_type = ?');
        params.push(req.query.bloodType);
    }

    const rows = await query(
        `SELECT s.id, s.blood_bank_id, b.name AS bank_name, b.region, b.phone, b.address,
                s.blood_type, s.units, s.last_updated,
                (SELECT COUNT(*) FROM blood_units u
                 WHERE u.blood_bank_id = s.blood_bank_id AND u.blood_type = s.blood_type
                   AND u.status = 'available' AND u.expiry_date BETWEEN ? AND ?) AS expiring
         FROM blood_stock s JOIN users b ON b.id = s.blood_bank_id
         WHERE ${where.join(' AND ')}
         ORDER BY b.name, FIELD(s.blood_type, ${BLOOD_TYPES.map(() => '?').join(', ')})`,
        [today(), addDays(today(), RULES.EXPIRY_WARNING_DAYS), ...params, ...BLOOD_TYPES]);
    res.json(rows.map((r) => ({ ...r, expiring: Number(r.expiring), low: r.units < RULES.LOW_STOCK_THRESHOLD })));
}));

// Banks holding blood a recipient of the given group can receive.
router.get('/compatible', ah(async (req, res) => {
    const { bloodType } = req.query;
    if (!isBloodType(bloodType)) throw new HttpError(400, 'Invalid blood type');
    const types = compatibleDonorTypes(bloodType);
    const rows = await query(
        `SELECT s.blood_bank_id, b.name AS bank_name, b.region, s.blood_type, s.units
         FROM blood_stock s JOIN users b ON b.id = s.blood_bank_id
         WHERE b.status = 'approved' AND s.units > 0 AND s.blood_type IN (?)
         ORDER BY (s.blood_type = ?) DESC, s.units DESC`,
        [types, bloodType]);
    res.json({ bloodType, compatibleTypes: types, stock: rows });
}));

// Add bags received outside the donation workflow, with the date the blood was collected.
router.post('/', requireRole('bloodbank'), ah(async (req, res) => {
    const { blood_type } = req.body ?? {};
    const units = Number(req.body?.units);
    const collectedOn = req.body?.collected_on || today();
    if (!isBloodType(blood_type)) throw new HttpError(400, 'Invalid blood type');
    if (!Number.isInteger(units) || units < 1 || units > 500) throw new HttpError(400, 'Units must be a whole number from 1 to 500');
    if (!parseDate(collectedOn) || collectedOn > today()) throw new HttpError(400, 'Enter the date the blood was collected (not in the future)');
    if (expiryDate(collectedOn) < today()) {
        throw new HttpError(400, 'Blood collected on {date} has already expired and cannot be added to stock', { vars: { date: collectedOn } });
    }

    await withTransaction(async (q) => {
        await addUnits(q, req.user.id, blood_type, units, { source: 'received', collectedOn });
        await audit(req, 'stock.received', { details: { units, bloodType: blood_type, date: collectedOn } }, q);
    });
    const [row] = await query('SELECT * FROM blood_stock WHERE blood_bank_id = ? AND blood_type = ?', [req.user.id, blood_type]);
    res.status(201).json({ stock: row, message: req.t('{units} unit(s) of {bloodType} added', { units, bloodType: blood_type }) });
}));

const UNIT_STATUSES = ['available', 'issued', 'expired', 'discarded'];

/*
 * The bags a bank holds or has held, with where each came from and where it went (traceability).
 * status: one status, several separated by commas, or 'all'. The manager may pass bankId.
 */
router.get('/units', requireRole('bloodbank', 'admin'), ah(async (req, res) => {
    const where = [];
    const params = [];
    if (req.user.role === 'bloodbank') { where.push('u.blood_bank_id = ?'); params.push(req.user.id); }
    else if (req.query.bankId) { where.push('u.blood_bank_id = ?'); params.push(parseId(req.query.bankId)); }

    const statuses = String(req.query.status || 'available').split(',');
    if (!statuses.includes('all')) {
        if (!statuses.every((s) => UNIT_STATUSES.includes(s))) throw new HttpError(400, 'Invalid bag status');
        where.push('u.status IN (?)');
        params.push(statuses);
    }
    if (req.query.bloodType) {
        if (!isBloodType(req.query.bloodType)) throw new HttpError(400, 'Invalid blood type');
        where.push('u.blood_type = ?');
        params.push(req.query.bloodType);
    }

    const rows = await query(
        `SELECT u.id, u.blood_bank_id, u.blood_type, u.source, u.donation_id, u.classification, u.collected_on,
                u.expiry_date, u.status, u.blood_request_id, u.transfer_id, u.discard_reason, u.discard_notes,
                u.status_changed_at, b.name AS bank_name, d.name AS donor_name, p.name AS issued_to,
                sb.name AS transferred_from
         FROM blood_units u
         JOIN users b ON b.id = u.blood_bank_id
         LEFT JOIN donations dn ON dn.id = u.donation_id
         LEFT JOIN users d ON d.id = dn.donor_id
         LEFT JOIN blood_requests r ON r.id = u.blood_request_id
         LEFT JOIN users p ON p.id = r.recipient_id
         LEFT JOIN inter_bank_requests t ON t.id = u.transfer_id
         LEFT JOIN users sb ON sb.id = t.to_bank_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY (u.status = 'available') DESC,
                  CASE WHEN u.status = 'available' THEN u.expiry_date END ASC,
                  CASE WHEN u.status = 'available' THEN u.id END ASC,
                  u.status_changed_at DESC, u.id DESC
         LIMIT 500`,
        params);
    const now = today();
    res.json(rows.map((r) => ({ ...r, unit_number: unitNumber(r.id), ...expiryState(r.expiry_date, now) })));
}));

router.patch('/units/:id/discard', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const reason = req.body?.reason;
    const notes = cleanText(req.body?.notes);
    if (!DISCARD_REASONS.includes(reason)) throw new HttpError(400, 'Choose why the bag is discarded');
    if (reason === 'other' && !notes) throw new HttpError(400, 'Explain why the bag is discarded');

    const bag = await withTransaction(async (q) => {
        const discarded = await discardUnit(q, req.user.id, id, reason, notes);
        await audit(req, 'stock.discarded', {
            entityType: 'blood_unit', entityId: id,
            details: { unit: unitNumber(id), bloodType: discarded.blood_type, reason: DISCARD_REASON_LABELS[reason], notes },
        }, q);
        return discarded;
    });
    res.json({ message: req.t('Bag {number} ({bloodType}) discarded and removed from stock', { number: unitNumber(id), bloodType: bag.blood_type }) });
}));

export default router;
