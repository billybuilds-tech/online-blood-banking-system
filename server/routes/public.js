import { Router } from 'express';
import { query } from '../db.js';
import { ah } from '../utils/http.js';
import { today } from '../utils/rules.js';

const router = Router();

/*
 * Figures for the home page, open to everyone: counts of banks, donors, donations and coming
 * campaigns. Blood stock is confidential and is never included.
 */
router.get('/summary', ah(async (_req, res) => {
    const [[banks], [donors], [donations], [campaigns]] = await Promise.all([
        query("SELECT COUNT(*) AS n FROM users WHERE role = 'bloodbank' AND status = 'approved'"),
        query("SELECT COUNT(*) AS n FROM users WHERE role = 'donor' AND status = 'approved'"),
        query('SELECT COUNT(*) AS n FROM donations'),
        query("SELECT COUNT(*) AS n FROM campaigns WHERE status = 'scheduled' AND campaign_date >= ?", [today()]),
    ]);
    res.json({
        banks: Number(banks.n),
        donors: Number(donors.n),
        donations: Number(donations.n),
        campaigns: Number(campaigns.n),
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
