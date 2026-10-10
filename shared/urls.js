import { normalizePhone } from './phone.js';

export function telephoneUrl(value) {
    if (typeof value !== 'string') return '#';
    const phone = normalizePhone(value) || value;
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return '#';
    return `tel:+${encodeURIComponent(phone.slice(1))}`;
}
