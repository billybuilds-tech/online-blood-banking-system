import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { MESSAGES } from '../components/AuthLayout.jsx';
import Icon from '../components/Icon.jsx';
import Logo, { LogoMark } from '../components/Logo.jsx';
import StockGrid from '../components/StockGrid.jsx';
import { formatDateTime } from '../constants.js';
import { LanguageSwitch, useI18n } from '../i18n.jsx';

const STEPS = [
    { icon: 'user', title: 'Register', text: 'Create a free account as a donor, a patient’s family or a blood bank.' },
    { icon: 'calendar', title: 'Answer and book', text: 'Answer a few health questions, then choose a blood bank and a day.' },
    { icon: 'check', title: 'Donate safely', text: 'On the day, the bank checks your health before any blood is collected.' },
    { icon: 'award', title: 'Save lives', text: 'Download your certificate, and get a message when your blood helps a patient.' },
];

const FEATURES = [
    { icon: 'search', title: 'Live blood stock', text: 'See which bank holds each blood group, updated with every donation and request.' },
    { icon: 'megaphone', title: 'Urgent appeals', text: 'When a group runs low, the bank alerts nearby donors who can give today.' },
    { icon: 'box', title: 'Every bag tracked', text: 'Each bag has a number and an expiry date; the oldest is used first and expired blood is never issued.' },
    { icon: 'swap', title: 'Banks help each other', text: 'A bank that runs short can ask another, and the transfer is recorded.' },
    { icon: 'bell', title: 'Instant updates', text: 'Notifications arrive in real time and by email, in Swahili or English.' },
    { icon: 'chart', title: 'Reports for planning', text: 'The Blood Bank Manager sees trends, wastage and days of supply for every group.' },
];

const ROLES = [
    { icon: 'drop', title: 'Donors', text: 'Register, book donation appointments, see your history and download a certificate after every verified donation.', cta: 'Become a donor', to: '/register?role=donor' },
    { icon: 'search', title: 'Recipients', text: 'See which blood bank holds the blood group you need, send a request and follow its status.', cta: 'Request blood', to: '/register?role=recipient' },
    { icon: 'box', title: 'Blood banks', text: 'Manage stock, verify donations, approve requests and exchange units with other banks.', cta: 'Register a blood bank', to: '/register?role=bloodbank' },
    { icon: 'chart', title: 'Blood Bank Manager', text: 'Approve blood banks, manage users, monitor activity, send notifications and produce reports.' },
];

// Public totals for the hero card and the figures band (no login needed).
function useSummary() {
    const [summary, setSummary] = useState(null);
    useEffect(() => {
        let alive = true;
        api('/public/summary').then((data) => { if (alive) setSummary(data); }).catch(() => {});
        return () => { alive = false; };
    }, []);
    return summary;
}

export default function Home() {
    const { t } = useI18n();
    const summary = useSummary();
    const figure = (value) => (summary ? value.toLocaleString() : '–');

    return (
        <div className="landing">
            <header className="land-top">
                <div className="land-wrap land-top-row">
                    <Logo />
                    <nav className="land-nav" aria-label={t('Sections')}>
                        <a href="#how">{t('How it works')}</a>
                        <a href="#stock">{t('Blood available')}</a>
                        <a href="#roles">{t('Who it is for')}</a>
                    </nav>
                    <div className="land-actions">
                        <LanguageSwitch />
                        <Link className="btn btn-ghost" to="/login">{t('Log in')}</Link>
                        <Link className="btn btn-primary land-register" to="/register">{t('Register')}</Link>
                    </div>
                </div>
            </header>

            <section className="land-hero">
                <div className="land-wrap land-hero-grid">
                    <div className="land-hero-text">
                        <p className="land-pill"><LogoMark size={18} /> {t('Blood banking for Tanzania')}</p>
                        <h1>{t('Give blood.')} <span>{t('Save lives.')}</span></h1>
                        <p className="land-lead">{t('One platform for blood donors, recipients and blood banks in Tanzania')}. {t('Find available blood across banks in seconds, book a donation, and move units between banks through a controlled, recorded process.')}</p>
                        <div className="land-cta">
                            <Link className="btn btn-primary btn-lg" to="/register?role=donor">{t('Become a donor')}</Link>
                            <Link className="btn btn-ghost btn-lg" to="/register?role=recipient">{t('Request blood')}</Link>
                        </div>
                        <ul className="land-trust">
                            <li><Icon name="check" size={16} /> {t('Free to use')}</li>
                            <li><Icon name="check" size={16} /> {t('Swahili and English')}</li>
                            <li><Icon name="check" size={16} /> {t('Works on any phone')}</li>
                        </ul>
                    </div>

                    <div className="land-stock-card" id="stock">
                        <div className="land-stock-head">
                            <div>
                                <h2>{t('Blood available now')}</h2>
                                <p className="muted small">
                                    {summary ? t('{units} units in {banks} blood banks', { units: summary.units, banks: summary.banks }) : t('Loading…')}
                                </p>
                            </div>
                            <span className="land-live"><span className="land-live-dot" />{t('Live')}</span>
                        </div>
                        <StockGrid rows={summary?.stock ?? []} />
                        <p className="muted small">
                            {summary && t('Updated {time}. Log in to see each bank and send a request.', { time: formatDateTime(summary.updatedAt) })}
                        </p>
                    </div>
                </div>
            </section>

            <section className="land-figures" aria-label={t('The system in numbers')}>
                <div className="land-wrap land-figures-grid">
                    <div><strong>{figure(summary?.banks ?? 0)}</strong><span>{t('Blood banks')}</span></div>
                    <div><strong>{figure(summary?.donors ?? 0)}</strong><span>{t('Registered donors')}</span></div>
                    <div><strong>{figure(summary?.donations ?? 0)}</strong><span>{t('Verified donations')}</span></div>
                    <div><strong>{figure(summary?.units ?? 0)}</strong><span>{t('Units available now')}</span></div>
                </div>
            </section>

            <section className="land-section" id="how">
                <div className="land-wrap">
                    <p className="land-eyebrow">{t('How it works')}</p>
                    <h2 className="land-title">{t('From registration to a life saved, in four steps')}</h2>
                    <ol className="land-steps">
                        {STEPS.map((s, i) => (
                            <li key={s.title}>
                                <span className="land-step-icon"><Icon name={s.icon} size={22} /><b>{i + 1}</b></span>
                                <h3>{t(s.title)}</h3>
                                <p>{t(s.text)}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section className="land-section land-soft">
                <div className="land-wrap">
                    <p className="land-eyebrow">{t('What the system does')}</p>
                    <h2 className="land-title">{t('Built for the way blood banks work')}</h2>
                    <div className="land-features">
                        {FEATURES.map((f) => (
                            <article key={f.title}>
                                <span className="land-feature-icon"><Icon name={f.icon} size={22} /></span>
                                <h3>{t(f.title)}</h3>
                                <p>{t(f.text)}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="land-section" id="roles">
                <div className="land-wrap">
                    <p className="land-eyebrow">{t('Who it is for')}</p>
                    <h2 className="land-title">{t('One system, four kinds of users')}</h2>
                    <div className="land-roles">
                        {ROLES.map((r) => (
                            <article key={r.title}>
                                <span className="land-feature-icon"><Icon name={r.icon} size={22} /></span>
                                <h3>{t(r.title)}</h3>
                                <p>{t(r.text)}</p>
                                {r.cta
                                    ? <Link to={r.to} className="land-role-link">{t(r.cta)} →</Link>
                                    : <span className="muted small">{t('Account created by the system administrator')}</span>}
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="land-section land-soft">
                <div className="land-wrap">
                    <p className="land-eyebrow">{t('Did you know?')}</p>
                    <div className="land-facts">
                        {MESSAGES.slice(0, 3).map((m) => (
                            <article key={m.title}>
                                <h3>{t(m.title)}</h3>
                                <p>{t(m.text)}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="land-band">
                <div className="land-wrap land-band-row">
                    <div>
                        <h2>{t('Ready to give the gift of life?')}</h2>
                        <p>{t('It takes about an hour, and one donation can help up to three patients.')}</p>
                    </div>
                    <div className="land-cta">
                        <Link className="btn btn-lg land-btn-light" to="/register?role=donor">{t('Become a donor')}</Link>
                        <Link className="btn btn-lg land-btn-outline" to="/login">{t('Log in')}</Link>
                    </div>
                </div>
            </section>

            <footer className="land-footer">
                <div className="land-wrap land-footer-row">
                    <Logo tagline />
                    <p className="muted small">{t('Online Blood Banking System · Institute of Finance Management · 2026')}</p>
                </div>
            </footer>
        </div>
    );
}
