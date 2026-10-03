import { RULES } from '../config.js';
import { query, withTransaction } from '../db.js';
import { notify } from './notify.js';
import { addDays, checkEligibility } from './rules.js';

/*
 * Eligibility reminders (Recommendation 9): when the minimum interval has passed since a donor's
 * latest donation, tell the donor once that they may donate again. Donors with a current deferral or
 * an open appointment are skipped for now and reminded on a later run. Returns how many were sent.
 */
export async function sendEligibilityReminders(onDate) {
    const due = await query(
        `SELECT d.id AS donation_id, d.donor_id, d.donation_date, u.date_of_birth
         FROM donations d
         JOIN users u ON u.id = d.donor_id AND u.role = 'donor' AND u.status = 'approved'
         WHERE d.reminder_sent_at IS NULL
           AND d.donation_date <= ?
           AND d.donation_date = (SELECT MAX(d2.donation_date) FROM donations d2 WHERE d2.donor_id = d.donor_id)
           AND NOT EXISTS (SELECT 1 FROM deferrals df WHERE df.donor_id = d.donor_id AND (df.deferred_until IS NULL OR df.deferred_until > ?))
           AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.donor_id = d.donor_id AND a.status IN ('pending', 'approved'))`,
        [addDays(onDate, -RULES.MIN_DAYS_BETWEEN_DONATIONS), onDate]);

    let sent = 0;
    for (const row of due) {
        const { eligible } = checkEligibility({ dateOfBirth: row.date_of_birth, lastDonationDate: row.donation_date, bookingDate: onDate });
        await withTransaction(async (q) => {
            // Marked even when not sent (e.g. now above the age limit) so the donor is not checked again.
            await q('UPDATE donations SET reminder_sent_at = NOW() WHERE id = ?', [row.donation_id]);
            if (eligible) {
                await notify(row.donor_id, {
                    category: 'reminder',
                    title: 'You can donate again',
                    message: 'It is {days} days since your last donation, so you may donate again. Book an appointment when you are ready.',
                    vars: { days: RULES.MIN_DAYS_BETWEEN_DONATIONS },
                }, q);
            }
        });
        if (eligible) sent += 1;
    }
    return sent;
}
