import { RULES } from '../config.js';

export const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

// Red cell compatibility (Table 4.3): recipient group -> donor groups it can receive.
const COMPATIBILITY = {
    'O-': ['O-'],
    'O+': ['O+', 'O-'],
    'A-': ['A-', 'O-'],
    'A+': ['A+', 'A-', 'O+', 'O-'],
    'B-': ['B-', 'O-'],
    'B+': ['B+', 'B-', 'O+', 'O-'],
    'AB-': ['AB-', 'A-', 'B-', 'O-'],
    'AB+': [...BLOOD_TYPES],
};

export function isBloodType(value) {
    return BLOOD_TYPES.includes(value);
}

export function compatibleDonorTypes(recipientType) {
    return COMPATIBILITY[recipientType] ? [...COMPATIBILITY[recipientType]] : [];
}

/* ---------- Dates are handled as 'YYYY-MM-DD' strings in UTC ---------- */

export function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return toDateString(date) === match[0] ? date : null;
}

export function toDateString(date) {
    return date.toISOString().slice(0, 10);
}

export function today() {
    // Local calendar date, e.g. 2026-10-02
    return new Date().toLocaleDateString('en-CA');
}

export function addDays(dateStr, days) {
    const date = parseDate(dateStr);
    date.setUTCDate(date.getUTCDate() + days);
    return toDateString(date);
}

export function daysBetween(fromStr, toStr) {
    return Math.round((parseDate(toStr) - parseDate(fromStr)) / 86_400_000);
}

export function ageOn(dateOfBirth, onDate) {
    const dob = parseDate(dateOfBirth);
    const on = parseDate(onDate);
    let age = on.getUTCFullYear() - dob.getUTCFullYear();
    const beforeBirthday =
        on.getUTCMonth() < dob.getUTCMonth() ||
        (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate());
    if (beforeBirthday) age -= 1;
    return age;
}

/*
 * Donor eligibility (Section 4.5): age limits and minimum interval since the last verified donation.
 * Returns { eligible, reason?, vars?, nextEligibleDate?, age? }; reason is an English template
 * filled from vars and translated where it is shown.
 */
export function checkEligibility({ dateOfBirth, lastDonationDate, bookingDate }) {
    if (!parseDate(dateOfBirth)) {
        return { eligible: false, reason: 'Date of birth is required to check eligibility' };
    }
    const age = ageOn(dateOfBirth, bookingDate);
    if (age < RULES.MIN_DONOR_AGE) {
        return { eligible: false, age, reason: 'Donors must be at least {min} years old', vars: { min: RULES.MIN_DONOR_AGE } };
    }
    if (age > RULES.MAX_DONOR_AGE) {
        return { eligible: false, age, reason: 'Donors must not be older than {max} years', vars: { max: RULES.MAX_DONOR_AGE } };
    }
    if (lastDonationDate) {
        const gap = daysBetween(lastDonationDate, bookingDate);
        if (gap < RULES.MIN_DAYS_BETWEEN_DONATIONS) {
            const nextEligibleDate = addDays(lastDonationDate, RULES.MIN_DAYS_BETWEEN_DONATIONS);
            return {
                eligible: false,
                age,
                nextEligibleDate,
                reason: 'At least {days} days must pass between donations. You may book from {date}.',
                vars: { days: RULES.MIN_DAYS_BETWEEN_DONATIONS, date: nextEligibleDate },
            };
        }
    }
    return { eligible: true, age };
}

export function expiryDate(donationDate) {
    return addDays(donationDate, RULES.SHELF_LIFE_DAYS);
}

/* ---------- Blood bags (Recommendation 7) ---------- */

// Number printed on a bag's label, e.g. OBBS-U-000123.
export function unitNumber(id) {
    return `OBBS-U-${String(id).padStart(6, '0')}`;
}

// A bag may be used up to and including its expiry date.
export function expiryState(expiry, onDate) {
    const daysLeft = daysBetween(onDate, expiry);
    if (daysLeft < 0) return { state: 'expired', daysLeft };
    if (daysLeft <= RULES.EXPIRY_WARNING_DAYS) return { state: 'expiring', daysLeft };
    return { state: 'ok', daysLeft };
}

/*
 * Classifies a collection by its measured volume (Section 4.5, Recommendation 13):
 * 'standard', 'low_volume' (red cells only), 'incomplete' (not added to stock),
 * or 'over_volume' (above the accepted range for the bag; the entry must be checked).
 */
export function classifyCollection(volumeMl) {
    if (volumeMl > RULES.STANDARD_MAX_ML) return 'over_volume';
    if (volumeMl >= RULES.STANDARD_MIN_ML) return 'standard';
    if (volumeMl >= RULES.LOW_VOLUME_MIN_ML) return 'low_volume';
    return 'incomplete';
}

export function isLowStock(units) {
    return units < RULES.LOW_STOCK_THRESHOLD;
}
