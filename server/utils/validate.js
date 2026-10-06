import { RULES } from '../config.js';
import { HttpError } from './http.js';

export function isEmail(value) {
    return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isStrongPassword(value) {
    return typeof value === 'string' && value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export const PASSWORD_RULE = 'Password must be at least 8 characters and contain both letters and numbers';

export function requireUnits(value, max = RULES.MAX_UNITS_PER_REQUEST) {
    const units = Number(value);
    if (!Number.isInteger(units) || units < 1 || units > max) {
        throw new HttpError(400, 'Units must be a whole number from 1 to {max}', { vars: { max } });
    }
    return units;
}

export function cleanText(value, maxLength = 255) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text.slice(0, maxLength) : null;
}

// 9 to 15 digits, with an optional leading + and spaces or dashes between them.
export function isPhone(value) {
    if (typeof value !== 'string' || !/^\+?[\d\s-]+$/.test(value.trim())) return false;
    const digits = value.replace(/\D/g, '').length;
    return digits >= 9 && digits <= 15;
}

export const URGENCY = ['normal', 'urgent', 'critical'];

// Why the patient needs blood (the doctor's reason, in broad groups).
export const INDICATIONS = ['surgery', 'childbirth', 'anaemia', 'trauma', 'blood_disorder', 'cancer', 'other'];
