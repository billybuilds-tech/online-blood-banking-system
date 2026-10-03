import sw from '../locales/sw.js';
import { BADGES } from './recognition.js';
import { DEFERRAL_REASON_LABELS } from './screening.js';

/*
 * English text is the key; the Swahili dictionary maps it to a translation.
 * Text without an entry (names, free text typed by users) is returned unchanged.
 */

// Placeholder values that are system words (statuses, roles, deferral reasons) are translated too.
const SYSTEM_WORDS = new Set([
    'pending', 'approved', 'completed', 'rejected', 'suspended', 'deferred',
    'normal', 'urgent', 'critical', 'donor', 'recipient', 'bloodbank',
    ...Object.values(DEFERRAL_REASON_LABELS),
    ...BADGES.map((b) => b.label),
]);

export function langFrom(header) {
    return String(header || '').trim().toLowerCase().startsWith('sw') ? 'sw' : 'en';
}

export function translate(lang, text, vars) {
    if (typeof text !== 'string') return text;
    let out = lang === 'sw' ? (sw[text] ?? text) : text;
    if (vars) {
        out = out.replace(/\{(\w+)\}/g, (match, key) => {
            if (!(key in vars) || vars[key] === null || vars[key] === undefined) return match;
            const value = String(vars[key]);
            return lang === 'sw' && SYSTEM_WORDS.has(value) ? (sw[value] ?? value) : value;
        });
    }
    return out;
}

// Express middleware: req.lang and req.t(text, vars) for every request.
export function language(req, _res, next) {
    req.lang = langFrom(req.headers['accept-language']);
    req.t = (text, vars) => translate(req.lang, text, vars);
    next();
}
