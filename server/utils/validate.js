import { RULES } from '../config.js';
import { HttpError } from './http.js';
import { normalizePhone, PHONE_RULE } from '../../shared/phone.js';

export function isEmail(value) {
    return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isStrongPassword(value, minimum = 8) {
    return typeof value === 'string' && value.length >= minimum && Buffer.byteLength(value, 'utf8') <= 72 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export const CREDENTIAL_RULE = 'Use at least 8 characters with letters and numbers, and at most 72 UTF-8 bytes';

export function requireUnits(value, max = RULES.MAX_UNITS_PER_REQUEST) {
    const units = Number(value);
    if (!Number.isInteger(units) || units < 1 || units > max) {
        throw new HttpError(400, 'Units must be a whole number from 1 to {max}', { vars: { max } });
    }
    return units;
}

export function cleanText(value, maxLength = 255) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new HttpError(400, 'Text fields must be strings');
    const text = value.trim();
    return text ? text.slice(0, maxLength) : null;
}

export function isPhone(value) {
    return normalizePhone(value) !== null;
}

export function phoneNumber(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return null;
    const phone = normalizePhone(value);
    if (!phone) throw new HttpError(400, PHONE_RULE);
    return phone;
}

export const URGENCY = ['normal', 'urgent', 'critical'];

// Why the patient needs blood (the doctor's reason, in broad groups).
export const INDICATIONS = ['surgery', 'childbirth', 'anaemia', 'trauma', 'blood_disorder', 'cancer', 'other'];
