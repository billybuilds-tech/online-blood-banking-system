import { Router } from 'express';
import { RULES } from '../config.js';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { BLOOD_TYPES, compatibleDonorTypes, isBloodType } from '../utils/rules.js';
import { addToStock, setStock } from '../utils/stock.js';

const router = Router();
router.use(authenticate);

// Stock of every approved bank (optionally one bank or one group).
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
                s.blood_type, s.units, s.last_updated
         FROM blood_stock s JOIN users b ON b.id = s.blood_bank_id
         WHERE ${where.join(' AND ')}
         ORDER BY b.name, FIELD(s.blood_type, ${BLOOD_TYPES.map(() => '?').join(', ')})`,
        [...params, ...BLOOD_TYPES]);
    res.json(rows.map((r) => ({ ...r, low: r.units < RULES.LOW_STOCK_THRESHOLD })));
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

// Add units to own stock (e.g. blood received outside the donation workflow).
router.post('/', requireRole('bloodbank'), ah(async (req, res) => {
    const { blood_type } = req.body ?? {};
    const units = Number(req.body?.units);
    if (!isBloodType(blood_type)) throw new HttpError(400, 'Invalid blood type');
    if (!Number.isInteger(units) || units < 1 || units > 500) throw new HttpError(400, 'Units must be a whole number from 1 to 500');

    await withTransaction((q) => addToStock(q, req.user.id, blood_type, units));
    const [row] = await query('SELECT * FROM blood_stock WHERE blood_bank_id = ? AND blood_type = ?', [req.user.id, blood_type]);
    res.status(201).json({ stock: row, message: req.t('{units} unit(s) of {bloodType} added', { units, bloodType: blood_type }) });
}));

// Correct own stock to a counted value.
router.put('/', requireRole('bloodbank'), ah(async (req, res) => {
    const { blood_type } = req.body ?? {};
    const units = Number(req.body?.units);
    if (!isBloodType(blood_type)) throw new HttpError(400, 'Invalid blood type');
    if (!Number.isInteger(units) || units < 0 || units > 10000) throw new HttpError(400, 'Units must be a whole number of 0 or more');

    await withTransaction((q) => setStock(q, req.user.id, blood_type, units));
    const [row] = await query('SELECT * FROM blood_stock WHERE blood_bank_id = ? AND blood_type = ?', [req.user.id, blood_type]);
    res.json({ stock: row, message: req.t('{bloodType} stock set to {units} unit(s)', { units, bloodType: blood_type }) });
}));

export default router;
