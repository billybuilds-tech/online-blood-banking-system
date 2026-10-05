import { Router } from 'express';
import { query } from '../db.js';
import { ah } from '../utils/http.js';
import { BLOOD_TYPES, today } from '../utils/rules.js';

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

// Campaigns still to come, for the home page: public events, as posters announce them.
router.get('/campaigns', ah(async (_req, res) => {
    const rows = await query(
        `SELECT c.id, c.title, c.venue, c.region, c.campaign_date, c.start_time, c.end_time, b.name AS bank_name
         FROM campaigns c JOIN users b ON b.id = c.blood_bank_id
         WHERE c.status = 'scheduled' AND c.campaign_date >= ? AND b.status = 'approved'
         ORDER BY c.campaign_date, c.start_time LIMIT 6`,
        [today()]);
    res.json(rows.map((r) => ({ ...r, start_time: String(r.start_time).slice(0, 5), end_time: String(r.end_time).slice(0, 5) })));
}));

export default router;
