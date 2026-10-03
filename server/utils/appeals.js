import { checkEligibility } from './rules.js';

/*
 * Chooses who receives a donor appeal. candidates are donors of the right blood groups and region,
 * each with: date_of_birth, last_donation (YYYY-MM-DD or null), deferred (bool), has_open (bool).
 * Only donors who could donate today are kept: right age, at least the minimum interval since the
 * last donation, no current deferral and no open appointment.
 */
export function selectAppealTargets(candidates, onDate) {
    return candidates.filter((c) => !c.deferred && !c.has_open
        && checkEligibility({ dateOfBirth: c.date_of_birth, lastDonationDate: c.last_donation, bookingDate: onDate }).eligible);
}
