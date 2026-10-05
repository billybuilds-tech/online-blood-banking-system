import { Router } from 'express';
import { query } from '../db.js';
import { ah } from '../utils/http.js';
import { BLOOD_TYPES } from '../utils/rules.js';

const router = Router();

/*
 * Figures for the home page, open to everyone as national blood services publish their stock
 * levels: totals only, with no names, contact details or figures for a single bank.
 */
router.get('/summary', ah(async (_req, res) => {
    const [[banks], [donors], [donations], stock] = await Promise.all([
        query("SELECT COUNT(*) AS n FROM users WHERE role = 'bloodbank' AND status = 'approved'"),
        query("SELECT COUNT(*) AS n FROM users WHERE role = 'donor' AND status = 'approved'"),
        query('SELECT COUNT(*) AS n FROM donations'),
        query(`SELECT s.blood_type, SUM(s.units) AS units FROM blood_stock s JOIN users b ON b.id = s.blood_bank_id
               WHERE b.status = 'approved' GROUP BY s.blood_type`),
    ]);
    const byType = Object.fromEntries(stock.map((r) => [r.blood_type, Number(r.units)]));
    const rows = BLOOD_TYPES.map((type) => ({ blood_type: type, units: byType[type] ?? 0 }));
    res.json({
        banks: Number(banks.n),
        donors: Number(donors.n),
        donations: Number(donations.n),
        units: rows.reduce((sum, r) => sum + r.units, 0),
        stock: rows,
        updatedAt: new Date().toISOString(),
    });
}));

export default router;
