import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getLang, setLang as storeLang } from './lang.js';
import sw from './locales/sw.js';

/*
 * English text is the key; src/locales/sw.js maps it to Swahili.
 * {placeholders} are filled from vars, e.g. t('Welcome, {name}', { name }).
 */
export function translate(text, vars, lang = getLang()) {
    if (typeof text !== 'string') return text;
    let out = lang === 'sw' ? (sw[text] ?? text) : text;
    if (vars) {
        out = out.replace(/\{(\w+)\}/g, (match, key) => (key in vars && vars[key] != null ? String(vars[key]) : match));
    }
    return out;
}

const I18nContext = createContext({ lang: 'en', setLang: () => {}, t: translate });

export function I18nProvider({ children }) {
    const [lang, setLangState] = useState(getLang);

    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    const setLang = useCallback((next) => {
        storeLang(next);
        setLangState(next);
        // Server-translated content (notifications) reloads in the new language.
        window.dispatchEvent(new Event('obbs:lang'));
    }, []);

    const value = useMemo(() => ({
        lang,
        setLang,
        t: (text, vars) => translate(text, vars, lang),
    }), [lang, setLang]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
    return useContext(I18nContext);
}

export function LanguageSwitch() {
    const { lang, setLang } = useI18n();
    return (
        <div className="lang-switch" role="group" aria-label="Language / Lugha">
            {[['en', 'EN', 'English'], ['sw', 'SW', 'Kiswahili']].map(([code, label, name]) => (
                <button key={code} type="button" lang={code} title={name} aria-pressed={lang === code}
                    className={lang === code ? 'active' : ''} onClick={() => setLang(code)}>
                    {label}
                </button>
            ))}
        </div>
    );
}
