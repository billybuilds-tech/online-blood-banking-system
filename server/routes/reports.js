import { Router } from 'express';
import { RULES } from '../config.js';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { HttpError, ah } from '../utils/http.js';
import { sendEligibilityReminders } from '../utils/reminders.js';
import { BLOOD_TYPES, today } from '../utils/rules.js';
import { checkExpiry } from '../utils/stock.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

// Runs the eligibility reminders now (they also run automatically every hour).
router.post('/reminders', ah(async (req, res) => {
    const sent = await sendEligibilityReminders(today());
    await audit(req, 'system.reminders', { details: { count: sent } });
    res.json({ sent, message: req.t('Eligibility reminders sent to {count} donor(s)', { count: sent }) });
}));

// Runs the expiry check now (it also runs automatically every hour).
router.post('/expiry-check', ah(async (req, res) => {
    const result = await checkExpiry(today());
    await audit(req, 'system.expiry_check', { details: result });
    res.json({ ...result, message: req.t('Expiry check done: {expired} bag(s) removed, {warned} warning(s) sent', result) });
}));

// System-wide figures for the Blood Bank Manager dashboard and the monthly PDF report.
router.get('/summary', ah(async (req, res) => {
    const month = req.query.month || today().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Month must be in YYYY-MM format');

    const [users, stockByType, banks, donations, requests, transfers, appointments, lowStock, classes, incomplete, deferrals] = await Promise.all([
        query('SELECT role, status, COUNT(*) AS total FROM users GROUP BY role, status'),
        query(`SELECT s.blood_type, SUM(s.units) AS units
               FROM blood_stock s JOIN users b ON b.id = s.blood_bank_id
               WHERE b.status = 'approved' GROUP BY s.blood_type`),
        query(`SELECT b.id, b.name, b.region, COALESCE(SUM(s.units), 0) AS total_units
               FROM users b LEFT JOIN blood_stock s ON s.blood_bank_id = b.id
               WHERE b.role = 'bloodbank' AND b.status = 'approved'
               GROUP BY b.id, b.name, b.region ORDER BY b.name`),
        query(`SELECT COUNT(*) AS total, COALESCE(SUM(units), 0) AS units
               FROM donations WHERE DATE_FORMAT(donation_date, '%Y-%m') = ?`, [month]),
        query(`SELECT status, COUNT(*) AS total, COALESCE(SUM(units), 0) AS units
               FROM blood_requests WHERE DATE_FORMAT(created_at, '%Y-%m') = ? GROUP BY status`, [month]),
        query(`SELECT status, COUNT(*) AS total, COALESCE(SUM(units), 0) AS units
               FROM inter_bank_requests WHERE DATE_FORMAT(created_at, '%Y-%m') = ? GROUP BY status`, [month]),
        query(`SELECT status, COUNT(*) AS total
               FROM appointments WHERE DATE_FORMAT(appointment_date, '%Y-%m') = ? GROUP BY status`, [month]),
        query(`SELECT b.name AS bank_name, s.blood_type, s.units
               FROM blood_stock s JOIN users b ON b.id = s.blood_bank_id
               WHERE b.status = 'approved' AND s.units < ? ORDER BY s.units, b.name`, [RULES.LOW_STOCK_THRESHOLD]),
        query(`SELECT COALESCE(classification, 'not_recorded') AS classification, COUNT(*) AS total
               FROM donations WHERE DATE_FORMAT(donation_date, '%Y-%m') = ? GROUP BY classification`, [month]),
        query(`SELECT COUNT(*) AS total FROM appointments
               WHERE status = 'rejected' AND collected_volume_ml IS NOT NULL AND DATE_FORMAT(updated_at, '%Y-%m') = ?`, [month]),
        query(`SELECT COUNT(*) AS total, COALESCE(SUM(deferred_until IS NULL), 0) AS permanent
               FROM deferrals WHERE DATE_FORMAT(created_at, '%Y-%m') = ?`, [month]),
    ]);
    const classTotals = Object.fromEntries(classes.map((c) => [c.classification, Number(c.total)]));

    const stockMap = Object.fromEntries(stockByType.map((r) => [r.blood_type, Number(r.units)]));
    const byStatus = (rows) => Object.fromEntries(rows.map((r) => [r.status, { total: Number(r.total), units: Number(r.units ?? 0) }]));

    res.json({
        month,
        generatedAt: new Date().toISOString(),
        users: users.map((u) => ({ ...u, total: Number(u.total) })),
        stock: BLOOD_TYPES.map((type) => ({ blood_type: type, units: stockMap[type] ?? 0 })),
        banks: banks.map((b) => ({ ...b, total_units: Number(b.total_units) })),
        donations: { total: Number(donations[0].total), units: Number(donations[0].units) },
        collections: {
            standard: classTotals.standard ?? 0,
            low_volume: classTotals.low_volume ?? 0,
            not_recorded: classTotals.not_recorded ?? 0,
            incomplete: Number(incomplete[0].total),
        },
        deferrals: { total: Number(deferrals[0].total), permanent: Number(deferrals[0].permanent) },
        requests: byStatus(requests),
        transfers: byStatus(transfers),
        appointments: byStatus(appointments),
        lowStock,
        lowStockThreshold: RULES.LOW_STOCK_THRESHOLD,
    });
}));

export default router;
