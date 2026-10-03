import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { donorEligibility } from '../utils/donorStatus.js';
import { ah } from '../utils/http.js';
import { BADGES, currentBadge, donorNumber, nextBadge } from '../utils/recognition.js';
import { today } from '../utils/rules.js';

const router = Router();
router.use(authenticate);

// Digital donor card (like the donor record in eProgesa, Kenya): identity, confirmed group, history and badges.
router.get('/card', requireRole('donor'), ah(async (req, res) => {
    const [stats] = await query(
        `SELECT COUNT(*) AS donations, COALESCE(SUM(volume_ml), 0) AS total_volume_ml, MAX(donation_date) AS last_donation
         FROM donations WHERE donor_id = ?`,
        [req.user.id]);
    const count = Number(stats.donations);
    const day = today();
    const eligibility = await donorEligibility(req.user, day);
    const current = currentBadge(count);
    const next = nextBadge(count);
    const label = (b) => (b ? { ...b, label: req.t(b.label) } : null);

    res.json({
        donorNumber: donorNumber(req.user.id),
        name: req.user.name,
        blood_type: req.user.blood_type,
        blood_type_confirmed_at: req.user.blood_type_confirmed_at,
        blood_type_confirmed_by_name: req.user.blood_type_confirmed_by_name,
        member_since: req.user.created_at,
        donations: count,
        total_volume_ml: Number(stats.total_volume_ml),
        last_donation: stats.last_donation,
        eligible: eligibility.eligible,
        next_eligible_date: eligibility.eligible ? day : eligibility.nextEligibleDate ?? null,
        deferred: Boolean(eligibility.deferral),
        badge: label(current),
        next_badge: label(next),
        badges: BADGES.map((b) => ({ id: b.id, min: b.min, label: req.t(b.label), earned: count >= b.min })),
    });
}));

export default router;
