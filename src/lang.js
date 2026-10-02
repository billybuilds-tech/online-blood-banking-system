// Current interface language ('en' or 'sw'), remembered in this browser.
const KEY = 'obbs_lang';

function initialLanguage() {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved === 'en' || saved === 'sw') return saved;
    } catch { /* storage unavailable */ }
    return (navigator.language || '').toLowerCase().startsWith('sw') ? 'sw' : 'en';
}

let current = initialLanguage();

export function getLang() {
    return current;
}

export function setLang(lang) {
    current = lang;
    try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable */ }
}

export function getLocale() {
    return current === 'sw' ? 'sw-TZ' : 'en-GB';
}
