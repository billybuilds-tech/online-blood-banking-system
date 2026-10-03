import { query } from '../db.js';
import { checkEligibility } from './rules.js';

// The latest deferral that still applies on the given date (deferred_until = first date the donor may donate again).
export async function activeDeferral(donorId, onDate) {
    const [row] = await query(
        `SELECT reason, deferred_until FROM deferrals
         WHERE donor_id = ? AND (deferred_until IS NULL OR deferred_until > ?)
         ORDER BY deferred_until IS NULL DESC, deferred_until DESC LIMIT 1`,
        [donorId, onDate]);
    return row || null;
}

/*
 * Age, interval since the last verified donation (checkEligibility) and any health-check deferral.
 * When several apply, the one that ends last is reported. reason is an English template filled from vars.
 */
export async function donorEligibility(user, date) {
    const [last] = await query('SELECT MAX(donation_date) AS last FROM donations WHERE donor_id = ?', [user.id]);
    const result = checkEligibility({ dateOfBirth: user.date_of_birth, lastDonationDate: last?.last, bookingDate: date });
    const deferral = await activeDeferral(user.id, date);
    if (deferral) {
        const permanent = deferral.deferred_until === null;
        const laterThanInterval = permanent || result.eligible || !result.nextEligibleDate || deferral.deferred_until > result.nextEligibleDate;
        if (laterThanInterval) {
            return {
                eligible: false,
                lastDonationDate: last?.last || null,
                nextEligibleDate: deferral.deferred_until,
                deferral: { reason: deferral.reason, until: deferral.deferred_until, permanent },
                reason: permanent
                    ? 'You are not able to donate blood at present. Please talk to the blood bank for advice.'
                    : 'After your last health check you may donate again from {date}.',
                vars: { date: deferral.deferred_until },
            };
        }
    }
    return { ...result, lastDonationDate: last?.last || null };
}
