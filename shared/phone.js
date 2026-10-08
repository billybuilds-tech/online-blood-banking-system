export const PHONE_RULE = 'Enter a valid Tanzanian mobile number: 06XXXXXXXX, 07XXXXXXXX, +2556XXXXXXXX or +2557XXXXXXXX';

export function normalizePhone(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!/^\+?[0-9 -]+$/.test(text)) return null;
    const compact = text.replace(/[ -]/g, '');
    if (/^0[67]\d{8}$/.test(compact)) return `+255${compact.slice(1)}`;
    return /^\+255[67]\d{8}$/.test(compact) ? compact : null;
}
