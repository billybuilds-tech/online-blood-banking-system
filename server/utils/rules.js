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
 * Returns { eligible, reason?, nextEligibleDate?, age? }.
 */
export function checkEligibility({ dateOfBirth, lastDonationDate, bookingDate }) {
    if (!parseDate(dateOfBirth)) {
        return { eligible: false, reason: 'Date of birth is required to check eligibility' };
    }
    const age = ageOn(dateOfBirth, bookingDate);
    if (age < RULES.MIN_DONOR_AGE) {
        return { eligible: false, age, reason: `Donors must be at least ${RULES.MIN_DONOR_AGE} years old` };
    }
    if (age > RULES.MAX_DONOR_AGE) {
        return { eligible: false, age, reason: `Donors must not be older than ${RULES.MAX_DONOR_AGE} years` };
    }
    if (lastDonationDate) {
        const gap = daysBetween(lastDonationDate, bookingDate);
        if (gap < RULES.MIN_DAYS_BETWEEN_DONATIONS) {
            const nextEligibleDate = addDays(lastDonationDate, RULES.MIN_DAYS_BETWEEN_DONATIONS);
            return {
                eligible: false,
                age,
                nextEligibleDate,
                reason: `At least ${RULES.MIN_DAYS_BETWEEN_DONATIONS} days must pass between donations. You may book from ${nextEligibleDate}.`,
            };
        }
    }
    return { eligible: true, age };
}

export function expiryDate(donationDate) {
    return addDays(donationDate, RULES.SHELF_LIFE_DAYS);
}

export function isLowStock(units) {
    return units < RULES.LOW_STOCK_THRESHOLD;
}
