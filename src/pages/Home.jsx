import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { MESSAGES } from '../components/AuthLayout.jsx';
import { CampaignItem } from '../components/Campaigns.jsx';
import Icon from '../components/Icon.jsx';
import Logo, { LogoMark } from '../components/Logo.jsx';
import { HERO_PHOTOS } from '../heroPhotos.js';
import { LanguageSwitch, useI18n } from '../i18n.jsx';
import { useInstallApp } from '../install.js';

const STEPS = [
    { icon: 'user', title: 'Register', text: 'Create a free account as a donor, a patient’s family or a blood bank.' },
    { icon: 'calendar', title: 'Answer and book', text: 'Answer a few health questions, then choose a blood bank and a day.' },
    { icon: 'check', title: 'Donate safely', text: 'On the day, the bank checks your health before any blood is collected.' },
    { icon: 'award', title: 'Save lives', text: 'Download your certificate, and get a message when your blood helps a patient.' },
];

const FEATURES = [
    { icon: 'search', title: 'Blood banks near you', text: 'Find approved blood banks with their contacts and send a request; each bank keeps its stock confidential.' },
    { icon: 'megaphone', title: 'Urgent appeals', text: 'When a group runs low, the bank alerts nearby donors who can give today.' },
    { icon: 'box', title: 'Every bag tracked', text: 'Each bag has a number and an expiry date; the oldest is used first and expired blood is never issued.' },
    { icon: 'swap', title: 'Banks help each other', text: 'A bank that runs short can ask another, and the transfer is recorded.' },
    { icon: 'bell', title: 'Instant updates', text: 'Notifications arrive in real time and by email, in Swahili or English.' },
    { icon: 'chart', title: 'Reports for planning', text: 'The Blood Bank Manager sees trends, wastage and days of supply for every group.' },
];

const ROLES = [
    { icon: 'drop', title: 'Donors', text: 'Register, book donation appointments, see your history and download a certificate after every verified donation.', cta: 'Become a donor', to: '/register?role=donor' },
    { icon: 'search', title: 'Recipients', text: 'Find approved blood banks near you, send a request and follow it until the blood reaches you.', cta: 'Request blood', to: '/register?role=recipient' },
    { icon: 'box', title: 'Blood banks', text: 'Manage stock, verify donations, approve requests and exchange units with other banks.', cta: 'Register a blood bank', to: '/register?role=bloodbank' },
    { icon: 'chart', title: 'Blood Bank Manager', text: 'Approve blood banks, manage users, monitor activity, send notifications and produce reports.' },
];

const PHOTO_MS = 7000;

// Photos of blood donation behind the heading, one after another; dots choose a photo.
function HeroPhotos() {
    const { t } = useI18n();
    const [index, setIndex] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setIndex((i) => (i + 1) % HERO_PHOTOS.length), PHOTO_MS);
        return () => clearInterval(timer);
    }, [index]);
    const photo = HERO_PHOTOS[index];
    return (
        <>
            <div className="land-photos" aria-hidden="true">
                {HERO_PHOTOS.map((p, i) => (
                    <div key={p.src} className={i === index ? 'land-photo active' : 'land-photo'}
                        style={{ backgroundImage: `url(${p.src})`, backgroundPosition: p.position }} />
                ))}
            </div>
            <div className="land-photo-dots">
                {HERO_PHOTOS.map((p, i) => (
                    <button key={p.src} type="button" className={i === index ? 'active' : ''} onClick={() => setIndex(i)}
                        aria-label={t('Photo {n} of {total}', { n: i + 1, total: HERO_PHOTOS.length })} aria-current={i === index} />
                ))}
            </div>
            <a className="land-credit" href={photo.source} target="_blank" rel="noreferrer">
                {t('Photo: {author}, {license}', { author: photo.credit, license: photo.license })}
            </a>
        </>
    );
}

// Public data for the home page (no login needed): counts, and campaigns still to come.
function usePublic(path) {
    const [data, setData] = useState(null);
    useEffect(() => {
        let alive = true;
        api(path).then((result) => { if (alive) setData(result); }).catch(() => {});
        return () => { alive = false; };
    }, [path]);
    return data;
}

export default function Home() {
    const { t } = useI18n();
    const summary = usePublic('/public/summary');
    const campaigns = usePublic('/public/campaigns');
    const installApp = useInstallApp();
    const figure = (value) => (summary ? value.toLocaleString() : '–');

    return (
        <div className="landing">
            <header className="land-top">
                <div className="land-wrap land-top-row">
                    <Logo />
                    <nav className="land-nav" aria-label={t('Sections')}>
                        <a href="#how">{t('How it works')}</a>
                        <a href="#campaigns">{t('Campaigns')}</a>
                        <a href="#roles">{t('Who it is for')}</a>
                    </nav>
                    <div className="land-actions">
                        <LanguageSwitch />
                        {installApp && (
                            <button type="button" className="btn btn-ghost land-install" onClick={installApp} title={t('Install app')}>
                                <Icon name="install" size={18} /><span>{t('Install app')}</span>
                            </button>
                        )}
                        <Link className="btn btn-ghost" to="/login">{t('Log in')}</Link>
                        <Link className="btn btn-primary land-register" to="/register">{t('Register')}</Link>
                    </div>
                </div>
            </header>

            <section className="land-hero">
                <HeroPhotos />
                <div className="land-wrap land-hero-grid">
                    <div className="land-hero-text">
                        <p className="land-pill"><LogoMark size={18} /> {t('Blood banking for Tanzania')}</p>
                        <h1>{t('Give blood.')} <span>{t('Save lives.')}</span></h1>
                        <p className="land-lead">{t('One platform for blood donors, recipients and blood banks in Tanzania')}. {t('Book a donation, join campaigns near you, and request blood from approved blood banks and follow it until it arrives.')}</p>
                        <div className="land-cta">
                            <Link className="btn btn-lg land-btn-light" to="/register?role=donor">{t('Become a donor')}</Link>
                            <Link className="btn btn-lg land-btn-outline" to="/register?role=recipient">{t('Request blood')}</Link>
                        </div>
                        <ul className="land-trust">
                            <li><Icon name="check" size={16} /> {t('Free to use')}</li>
                            <li><Icon name="check" size={16} /> {t('Swahili and English')}</li>
                            <li><Icon name="check" size={16} /> {t('Works on any phone')}</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="land-figures" aria-label={t('The system in numbers')}>
                <div className="land-wrap land-figures-grid">
                    <div><strong>{figure(summary?.banks ?? 0)}</strong><span>{t('Blood banks')}</span></div>
                    <div><strong>{figure(summary?.donors ?? 0)}</strong><span>{t('Registered donors')}</span></div>
                    <div><strong>{figure(summary?.donations ?? 0)}</strong><span>{t('Verified donations')}</span></div>
                    <div><strong>{figure(summary?.campaigns ?? 0)}</strong><span>{t('Upcoming campaigns')}</span></div>
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

            {campaigns?.length > 0 && (
                <section className="land-section land-campaigns" id="campaigns">
                    <div className="land-wrap">
                        <p className="land-eyebrow">{t('Campaigns')}</p>
                        <h2 className="land-title">{t('Upcoming blood donation campaigns')}</h2>
                        <div className="campaign-list land-campaign-list">
                            {campaigns.slice(0, 4).map((c) => (
                                <CampaignItem key={c.id} campaign={c} aside={
                                    <Link className="btn btn-sm btn-primary" to="/register?role=donor">{t('Take part')}</Link>
                                } />
                            ))}
                        </div>
                    </div>
                </section>
            )}

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
                <p className="land-wrap land-photo-credits small muted">
                    {t('Photos from Wikimedia Commons:')}{' '}
                    {HERO_PHOTOS.map((p, i) => (
                        <span key={p.src}>{i > 0 && ' · '}<a href={p.source} target="_blank" rel="noreferrer">{p.credit}</a> ({p.license})</span>
                    ))}
                </p>
            </footer>
        </div>
    );
}
