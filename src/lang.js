// Current interface language ('en' or 'sw'), remembered in this browser.
const preferenceName = 'obbs_lang';

function initialLanguage() {
    try {
        const saved = localStorage.getItem(preferenceName);
        if (saved === 'en' || saved === 'sw') return saved;
    } catch { /* storage unavailable */ }
    return (navigator.language || '').toLowerCase().startsWith('sw') ? 'sw' : 'en';
}

let current = initialLanguage();

export function getLang() {
    return current;
}

export function setLang(lang) {
    if (!['en', 'sw'].includes(lang)) throw new Error('Unsupported language');
    current = lang;
    try { localStorage.setItem(preferenceName, lang); } catch { /* storage unavailable */ }
}

export function getLocale() {
    return current === 'sw' ? 'sw-TZ' : 'en-GB';
}
