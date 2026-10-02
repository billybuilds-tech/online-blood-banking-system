import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { ah } from '../utils/http.js';

const router = Router();
router.use(authenticate);

router.get('/', ah(async (req, res) => {
    const where = [];
    const params = [];
    if (req.user.role === 'donor') { where.push('dn.donor_id = ?'); params.push(req.user.id); }
    else if (req.user.role === 'bloodbank') { where.push('dn.blood_bank_id = ?'); params.push(req.user.id); }
    else if (req.user.role !== 'admin') return res.json([]);

    const rows = await query(
        `SELECT dn.*, d.name AS donor_name, b.name AS bank_name, b.region AS bank_region,
                (dn.expiry_date < CURDATE()) AS expired
         FROM donations dn
         JOIN users d ON d.id = dn.donor_id
         JOIN users b ON b.id = dn.blood_bank_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY dn.donation_date DESC, dn.id DESC`,
        params);
    res.json(rows.map((r) => ({ ...r, expired: Boolean(r.expired) })));
}));

export default router;
