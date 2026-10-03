import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { selectAppealTargets } from '../utils/appeals.js';
import { audit } from '../utils/audit.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { addDays, compatibleDonorTypes, isBloodType, today } from '../utils/rules.js';
import { cleanText } from '../utils/validate.js';

/*
 * Donor appeals (as in BISKIT, Nigeria): a blood bank short of a blood group calls the donors who
 * could donate today, and sees how many booked and donated in answer.
 */
const router = Router();
router.use(authenticate);

const ACTIVE = "a.status = 'active' AND a.expires_at >= ?";

function normalise(row) {
    return {
        ...row,
        include_compatible: Boolean(row.include_compatible),
        all_regions: Boolean(row.all_regions),
        is_active: Boolean(row.is_active),
        targeted: Number(row.targeted),
        booked: Number(row.booked),
        donated: Number(row.donated),
    };
}

router.get('/', ah(async (req, res) => {
    const day = today();

    if (req.user.role === 'donor') {
        // Active appeals this donor received.
        const rows = await query(
            `SELECT a.id, a.blood_bank_id, a.blood_type, a.message, a.expires_at, a.created_at,
                    b.name AS bank_name, b.region AS bank_region, b.address AS bank_address, b.phone AS bank_phone,
                    EXISTS(SELECT 1 FROM appointments ap WHERE ap.appeal_id = a.id AND ap.donor_id = ?) AS booked
             FROM donor_appeals a
             JOIN appeal_recipients r ON r.appeal_id = a.id AND r.donor_id = ?
             JOIN users b ON b.id = a.blood_bank_id
             WHERE ${ACTIVE}
             ORDER BY a.created_at DESC`,
            [req.user.id, req.user.id, day]);
        return res.json(rows.map((r) => ({ ...r, booked: Boolean(r.booked) })));
    }
    if (req.user.role !== 'bloodbank' && req.user.role !== 'admin') return res.json([]);

    const ownOnly = req.user.role === 'bloodbank';
    const rows = await query(
        `SELECT a.*, b.name AS bank_name, (a.status = 'active' AND a.expires_at >= ?) AS is_active,
                (SELECT COUNT(*) FROM appeal_recipients r WHERE r.appeal_id = a.id) AS targeted,
                (SELECT COUNT(*) FROM appointments ap WHERE ap.appeal_id = a.id) AS booked,
                (SELECT COUNT(*) FROM appointments ap WHERE ap.appeal_id = a.id AND ap.status = 'completed') AS donated
         FROM donor_appeals a JOIN users b ON b.id = a.blood_bank_id
         ${ownOnly ? 'WHERE a.blood_bank_id = ?' : ''}
         ORDER BY a.created_at DESC`,
        ownOnly ? [day, req.user.id] : [day]);
    res.json(rows.map(normalise));
}));

router.post('/', requireRole('bloodbank'), ah(async (req, res) => {
    const body = req.body ?? {};
    const bloodType = body.blood_type;
    if (!isBloodType(bloodType)) throw new HttpError(400, 'Choose a valid blood type');
    const days = body.days === undefined ? 3 : Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > 14) throw new HttpError(400, 'An appeal can last from 1 to 14 days');
    const includeCompatible = body.include_compatible === true;
    const allRegions = body.all_regions === true || !req.user.region;
    const note = cleanText(body.message);
    const day = today();

    const [existing] = await query(
        `SELECT a.id FROM donor_appeals a WHERE a.blood_bank_id = ? AND a.blood_type = ? AND ${ACTIVE}`,
        [req.user.id, bloodType, day]);
    if (existing) {
        throw new HttpError(409, 'You already have an active appeal for {bloodType}. Close it before sending a new one.', { vars: { bloodType } });
    }

    // Donors of the needed group (or every group that can give to it), in the bank's region unless all regions.
    const groups = includeCompatible ? compatibleDonorTypes(bloodType) : [bloodType];
    const candidates = await query(
        `SELECT u.id, u.date_of_birth,
                (SELECT MAX(d.donation_date) FROM donations d WHERE d.donor_id = u.id) AS last_donation,
                EXISTS(SELECT 1 FROM deferrals df WHERE df.donor_id = u.id AND (df.deferred_until IS NULL OR df.deferred_until > ?)) AS deferred,
                EXISTS(SELECT 1 FROM appointments ap WHERE ap.donor_id = u.id AND ap.status IN ('pending', 'approved')) AS has_open
         FROM users u
         WHERE u.role = 'donor' AND u.status = 'approved' AND u.blood_type IN (?) ${allRegions ? '' : 'AND u.region = ?'}`,
        [day, groups, ...(allRegions ? [] : [req.user.region])]);
    const targets = selectAppealTargets(
        candidates.map((c) => ({ ...c, deferred: Boolean(c.deferred), has_open: Boolean(c.has_open) })), day);
    if (!targets.length) {
        throw new HttpError(422, 'No eligible donors match this appeal right now. Try including compatible groups or all regions.');
    }

    const appeal = await withTransaction(async (q) => {
        const result = await q(
            `INSERT INTO donor_appeals (blood_bank_id, blood_type, include_compatible, all_regions, message, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, bloodType, includeCompatible, allRegions, note, addDays(day, days)]);
        for (const target of targets) {
            await q('INSERT INTO appeal_recipients (appeal_id, donor_id) VALUES (?, ?)', [result.insertId, target.id]);
            await notify(target.id, {
                category: 'appeal',
                title: 'Urgent: {bank} needs {bloodType} blood',
                message: note
                    ? '{bank} ({region}) urgently needs donors of blood group {groups}, and you can donate now. Open your dashboard to book. Message from the blood bank: {note}'
                    : '{bank} ({region}) urgently needs donors of blood group {groups}, and you can donate now. Open your dashboard to book.',
                vars: { bank: req.user.name, region: req.user.region || '-', bloodType, groups: groups.join(', '), note },
                senderId: req.user.id,
            }, q);
        }
        const [row] = await q('SELECT * FROM donor_appeals WHERE id = ?', [result.insertId]);
        return row;
    });

    await audit(req, 'appeal.sent', { entityType: 'donor_appeal', entityId: appeal.id, details: { bloodType, count: targets.length } });
    res.status(201).json({
        appeal,
        targeted: targets.length,
        message: req.t('Appeal sent to {count} eligible donor(s)', { count: targets.length }),
    });
}));

router.patch('/:id/close', requireRole('bloodbank'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const [appeal] = await query('SELECT id, blood_bank_id, blood_type FROM donor_appeals WHERE id = ?', [id]);
    if (!appeal) throw new HttpError(404, 'Appeal not found');
    if (appeal.blood_bank_id !== req.user.id) throw new HttpError(403, 'This appeal belongs to another blood bank');
    await query("UPDATE donor_appeals SET status = 'closed' WHERE id = ?", [id]);
    await audit(req, 'appeal.closed', { entityType: 'donor_appeal', entityId: id, details: { bloodType: appeal.blood_type } });
    res.json({ message: req.t('Appeal closed') });
}));

export default router;
