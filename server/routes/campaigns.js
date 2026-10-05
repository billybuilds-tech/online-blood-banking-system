import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { selectAppealTargets } from '../utils/appeals.js';
import { audit } from '../utils/audit.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { addDays, parseDate, today } from '../utils/rules.js';
import { cleanText } from '../utils/validate.js';

/*
 * Blood donation campaigns: a blood bank collects blood at a school, place of worship or
 * workplace on a set day, as the National Blood Transfusion Service does. Donors of the region
 * are invited and register through the usual booking (health questions, eligibility); each
 * registration is an appointment with campaign_id, so the day's checks and donations work as usual.
 */
const router = Router();
router.use(authenticate);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Donors registered (not refused), who donated, and who were deferred at the health check.
const COUNTS = `
    (SELECT COUNT(*) FROM appointments a WHERE a.campaign_id = c.id AND a.status <> 'rejected') AS registered,
    (SELECT COUNT(*) FROM appointments a WHERE a.campaign_id = c.id AND a.status = 'completed') AS donated,
    (SELECT COUNT(*) FROM appointments a WHERE a.campaign_id = c.id AND a.status = 'deferred') AS deferred`;

export function campaignState(row, day = today()) {
    if (row.status === 'cancelled') return 'cancelled';
    if (row.campaign_date < day) return 'finished';
    return row.campaign_date === day ? 'today' : 'upcoming';
}

function shape(row, day) {
    return {
        ...row,
        start_time: String(row.start_time).slice(0, 5),
        end_time: String(row.end_time).slice(0, 5),
        registered: Number(row.registered ?? 0),
        donated: Number(row.donated ?? 0),
        deferred: Number(row.deferred ?? 0),
        state: campaignState(row, day),
    };
}

/*
 * Donors: campaigns still to come, their own region first, with whether they registered.
 * Blood banks: their own campaigns, coming ones first. The manager: every campaign.
 */
router.get('/', ah(async (req, res) => {
    const day = today();
    if (req.user.role === 'donor') {
        const rows = await query(
            `SELECT c.*, b.name AS bank_name,
                    EXISTS(SELECT 1 FROM appointments a WHERE a.campaign_id = c.id AND a.donor_id = ? AND a.status <> 'rejected') AS joined
             FROM campaigns c JOIN users b ON b.id = c.blood_bank_id
             WHERE c.status = 'scheduled' AND c.campaign_date >= ? AND b.status = 'approved'
             ORDER BY (c.region = ?) DESC, c.campaign_date, c.start_time`,
            [req.user.id, day, req.user.region ?? '']);
        return res.json(rows.map((r) => ({ ...shape(r, day), joined: Boolean(r.joined) })));
    }
    if (req.user.role === 'recipient') return res.json([]);

    const own = req.user.role === 'bloodbank';
    const rows = await query(
        `SELECT c.*, b.name AS bank_name, ${COUNTS}
         FROM campaigns c JOIN users b ON b.id = c.blood_bank_id
         ${own ? 'WHERE c.blood_bank_id = ?' : ''}
         ORDER BY (c.campaign_date >= ?) DESC,
                  CASE WHEN c.campaign_date >= ? THEN c.campaign_date END ASC,
                  c.campaign_date DESC, c.start_time`,
        [...(own ? [req.user.id] : []), day, day]);
    res.json(rows.map((r) => shape(r, day)));
}));

router.post('/', requireRole('bloodbank'), ah(async (req, res) => {
    const body = req.body ?? {};
    const title = cleanText(body.title, 150);
    const venue = cleanText(body.venue, 200);
    const region = cleanText(body.region, 80) || req.user.region;
    const date = body.campaign_date;
    const start = body.start_time;
    const end = body.end_time;
    const target = Number(body.target_units);
    const description = cleanText(body.description, 500);
    if (!title || !venue) throw new HttpError(400, 'Enter the campaign title and venue');
    if (!region) throw new HttpError(400, 'Choose the region of the campaign');
    if (!parseDate(date) || date < today() || date > addDays(today(), 365)) {
        throw new HttpError(400, 'Choose a campaign date from today up to one year ahead');
    }
    if (!TIME.test(start || '') || !TIME.test(end || '') || start >= end) throw new HttpError(400, 'Enter a start time before the end time');
    if (!Number.isInteger(target) || target < 1 || target > 1000) throw new HttpError(400, 'The target must be from 1 to 1000 units');

    // Donors of the region who could donate on the campaign day are invited.
    const candidates = await query(
        `SELECT u.id, u.date_of_birth,
                (SELECT MAX(d.donation_date) FROM donations d WHERE d.donor_id = u.id) AS last_donation,
                EXISTS(SELECT 1 FROM deferrals df WHERE df.donor_id = u.id AND (df.deferred_until IS NULL OR df.deferred_until > ?)) AS deferred,
                EXISTS(SELECT 1 FROM appointments ap WHERE ap.donor_id = u.id AND ap.status IN ('pending', 'approved')) AS has_open
         FROM users u
         WHERE u.role = 'donor' AND u.status = 'approved' AND u.region = ?`,
        [date, region]);
    const invited = selectAppealTargets(
        candidates.map((c) => ({ ...c, deferred: Boolean(c.deferred), has_open: Boolean(c.has_open) })), date);

    const campaign = await withTransaction(async (q) => {
        const result = await q(
            `INSERT INTO campaigns (blood_bank_id, title, venue, region, campaign_date, start_time, end_time, target_units, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, title, venue, region, date, start, end, target, description]);
        const vars = { bank: req.user.name, title, venue, region, date, start, end };
        for (const donor of invited) {
            await notify(donor.id, {
                category: 'campaign',
                title: 'Blood donation campaign: {title}',
                message: '{bank} holds a blood donation campaign at {venue} ({region}) on {date}, {start}–{end}. Register on your dashboard to take part.',
                vars,
                senderId: req.user.id,
            }, q);
        }
        await audit(req, 'campaign.created', {
            entityType: 'campaign', entityId: result.insertId, details: { title, venue, date, count: invited.length },
        }, q);
        const [row] = await q('SELECT * FROM campaigns WHERE id = ?', [result.insertId]);
        return row;
    });

    res.status(201).json({
        campaign: shape(campaign, today()),
        invited: invited.length,
        message: req.t('Campaign created; {count} donor(s) in {region} were invited', { count: invited.length, region }),
    });
}));

// Cancels a campaign that has not taken place; its registrations close and the donors are told.
router.patch('/:id/cancel', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const reason = cleanText(req.body?.reason);

    const closed = await withTransaction(async (q) => {
        const [c] = await q('SELECT * FROM campaigns WHERE id = ? FOR UPDATE', [id]);
        if (!c) throw new HttpError(404, 'Campaign not found');
        if (c.blood_bank_id !== req.user.id) throw new HttpError(403, 'This campaign belongs to another blood bank');
        if (c.status === 'cancelled') throw new HttpError(409, 'This campaign is already cancelled');
        if (c.campaign_date < today()) throw new HttpError(409, 'A campaign that has taken place cannot be cancelled');

        await q("UPDATE campaigns SET status = 'cancelled' WHERE id = ?", [id]);
        const open = await q("SELECT id, donor_id FROM appointments WHERE campaign_id = ? AND status IN ('pending', 'approved')", [id]);
        const vars = { bank: req.user.name, title: c.title, venue: c.venue, date: c.campaign_date, reason };
        for (const a of open) {
            await q("UPDATE appointments SET status = 'rejected', rejection_reason = ? WHERE id = ?", [reason || 'Campaign cancelled', a.id]);
            await notify(a.donor_id, {
                category: 'campaign',
                title: 'Campaign cancelled: {title}',
                message: reason
                    ? '{bank} cancelled the campaign at {venue} on {date}. Reason: {reason}. You may book another donation.'
                    : '{bank} cancelled the campaign at {venue} on {date}. You may book another donation.',
                vars,
                senderId: req.user.id,
            }, q);
        }
        await audit(req, 'campaign.cancelled', {
            entityType: 'campaign', entityId: id, details: { title: c.title, date: c.campaign_date, count: open.length },
        }, q);
        return open.length;
    });
    res.json({ message: req.t('Campaign cancelled; {count} registered donor(s) were told', { count: closed }) });
}));

export default router;
