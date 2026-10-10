import { Router } from 'express';
import { RULES } from '../config.js';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { HttpError, ah, parseId } from '../utils/http.js';
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

/* ---------- Trends for the charts (Recommendation 2) ---------- */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function addMonths(month, n) {
    const [y, m] = month.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1 + n, 1));
    return date.toISOString().slice(0, 7);
}

/*
 * Month-by-month figures from `from` to `to` (YYYY-MM, at most 24 months; default the last 12),
 * for all banks or one (bankId), plus how many days the current stock of each group would last
 * at the rate it was issued over the last 30 days.
 */
router.get('/trends', ah(async (req, res) => {
    const { to: requestedTo, from: requestedFrom } = req.query;
    if ((requestedTo != null && typeof requestedTo !== 'string') ||
        (requestedFrom != null && typeof requestedFrom !== 'string'))
        throw new HttpError(400, 'Choose a valid range of months');
    const to = requestedTo || today().slice(0, 7);
    if (!MONTH.test(to) || Number(to.slice(0, 4)) < 1000 || Number(to.slice(0, 4)) > 9998)
        throw new HttpError(400, 'Choose a valid range of months');
    const from = requestedFrom || addMonths(to, -11);
    if (!MONTH.test(from) || !MONTH.test(to) || from > to) throw new HttpError(400, 'Choose a valid range of months');
    const months = [];
    for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);
    if (months.length > 24) throw new HttpError(400, 'Choose at most 24 months');
    const start = `${from}-01`;
    const end = `${addMonths(to, 1)}-01`;

    let bank = '';
    const bankParams = [];
    if (req.query.bankId) {
        bank = 'AND blood_bank_id = ?';
        bankParams.push(parseId(req.query.bankId));
    }
    const range = [start, end, ...bankParams];

    const [donations, requests, response, groups, bags, stock, used] = await Promise.all([
        query(`SELECT DATE_FORMAT(donation_date, '%Y-%m') AS month, COALESCE(classification, 'standard') AS class, COUNT(*) AS n
               FROM donations WHERE donation_date >= ? AND donation_date < ? ${bank} GROUP BY month, class`, range),
        query(`SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, status, COUNT(*) AS n, SUM(units) AS units
               FROM blood_requests WHERE created_at >= ? AND created_at < ? ${bank} GROUP BY month, status`, range),
        query(`SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, decided_at)) AS minutes,
                      AVG(TIMESTAMPDIFF(MINUTE, created_at, received_at)) AS delivery_minutes,
                      SUM(delivery_status = 'received') AS received,
                      SUM(delivery_status IN ('preparing', 'ready', 'dispatched')) AS in_progress
               FROM blood_requests WHERE status <> 'pending' AND created_at >= ? AND created_at < ? ${bank}`, range),
        query(`SELECT blood_type, SUM(units) AS requested, SUM(CASE WHEN status = 'approved' THEN units ELSE 0 END) AS issued
               FROM blood_requests WHERE created_at >= ? AND created_at < ? ${bank} GROUP BY blood_type`, range),
        query(`SELECT DATE_FORMAT(status_changed_at, '%Y-%m') AS month, status, COUNT(*) AS n
               FROM blood_units WHERE status IN ('issued', 'expired', 'discarded')
                 AND status_changed_at >= ? AND status_changed_at < ? ${bank} GROUP BY month, status`, range),
        query(`SELECT s.blood_type, SUM(s.units) AS units FROM blood_stock s JOIN users b ON b.id = s.blood_bank_id
               WHERE b.status = 'approved' ${bank.replace('blood_bank_id', 's.blood_bank_id')} GROUP BY s.blood_type`, bankParams),
        query(`SELECT blood_type, COUNT(*) AS n FROM blood_units
               WHERE status = 'issued' AND status_changed_at >= NOW() - INTERVAL 30 DAY ${bank} GROUP BY blood_type`, bankParams),
    ]);

    // Turns rows of (month, key, value) into one object per month with every key present.
    const byMonth = (rows, key, keys, value = 'n') => months.map((month) => ({
        month,
        ...Object.fromEntries(keys.map((k) => [k, Number(rows.find((r) => r.month === month && r[key] === k)?.[value] ?? 0)])),
    }));
    const requestMonths = byMonth(requests, 'status', ['approved', 'rejected', 'pending']);
    const bagMonths = byMonth(bags, 'status', ['issued', 'expired', 'discarded']);
    const sum = (list, key) => list.reduce((s, r) => s + r[key], 0);

    const decided = sum(requestMonths, 'approved') + sum(requestMonths, 'rejected');
    const issuedBags = sum(bagMonths, 'issued');
    const wastedBags = sum(bagMonths, 'expired') + sum(bagMonths, 'discarded');
    const hours = (value) => (value === null ? null : Math.round((Number(value) / 60) * 10) / 10);

    res.json({
        from,
        to,
        donations: byMonth(donations, 'class', ['standard', 'low_volume']),
        requests: requestMonths,
        bags: bagMonths,
        groups: BLOOD_TYPES.map((type) => {
            const row = groups.find((g) => g.blood_type === type);
            return { blood_type: type, requested: Number(row?.requested ?? 0), issued: Number(row?.issued ?? 0) };
        }),
        supply: BLOOD_TYPES.map((type) => {
            const units = Number(stock.find((s) => s.blood_type === type)?.units ?? 0);
            const used30 = Number(used.find((u) => u.blood_type === type)?.n ?? 0);
            return { blood_type: type, units, used_30d: used30, days_left: used30 ? Math.round((units / (used30 / 30)) * 10) / 10 : null };
        }),
        totals: {
            donations: donations.reduce((s, r) => s + Number(r.n), 0),
            requests: decided + sum(requestMonths, 'pending'),
            approval_rate: decided ? Math.round((sum(requestMonths, 'approved') / decided) * 1000) / 10 : null,
            avg_response_hours: hours(response[0].minutes),
            avg_delivery_hours: hours(response[0].delivery_minutes),
            received: Number(response[0].received ?? 0),
            in_delivery: Number(response[0].in_progress ?? 0),
            issued_bags: issuedBags,
            wasted_bags: wastedBags,
            wastage_rate: issuedBags + wastedBags ? Math.round((wastedBags / (issuedBags + wastedBags)) * 1000) / 10 : null,
        },
    });
}));

// System-wide figures for the Blood Bank Manager dashboard and the monthly PDF report.
router.get('/summary', ah(async (req, res) => {
    const month = req.query.month || today().slice(0, 7);
    if (typeof month !== 'string') throw new HttpError(400, 'Invalid month');
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
