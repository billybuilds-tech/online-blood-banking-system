import { useEffect, useState } from 'react';
import { LanguageSwitch, useI18n } from '../i18n.jsx';
import Logo from './Logo.jsx';

// Short messages shown beside the login and registration forms, one after another.
export const MESSAGES = [
    { title: 'One donation can help up to three patients.', text: 'Donated blood is separated into red cells, plasma and platelets, and each part can go to a different patient.' },
    { title: 'Blood cannot be made in a factory.', text: 'It comes only from people who choose to give. Every donor helps keep hospitals ready for emergencies.' },
    { title: 'Your health is checked before every donation.', text: 'A few questions and a check of weight, haemoglobin, blood pressure, pulse and temperature keep donors and patients safe.' },
    { title: 'You can give again after 90 days.', text: 'The system reminds you when you may donate again and keeps every donation and certificate in one place.' },
    { title: 'Blood banks share blood with each other.', text: 'When one bank runs short, another can send blood through a recorded transfer, so patients wait less.' },
];
const ROTATE_MS = 7000;

// Drifting red cells behind the messages; purely decorative.
function Cells() {
    const cells = [[12, 18, 46], [82, 12, 30], [70, 62, 58], [22, 78, 34], [92, 88, 22], [44, 40, 18]];
    return (
        <svg className="auth-cells" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            {cells.map(([x, y, r], i) => (
                <g key={i} className={`cell cell-${i % 3}`}>
                    <circle cx={x} cy={y} r={r / 4} fill="#fff" fillOpacity="0.07" />
                    <circle cx={x} cy={y} r={r / 9} fill="#fff" fillOpacity="0.06" />
                </g>
            ))}
        </svg>
    );
}

function Messages() {
    const { t } = useI18n();
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (paused) return undefined;
        const timer = setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), ROTATE_MS);
        return () => clearInterval(timer);
    }, [paused]);

    const message = MESSAGES[index];
    return (
        <div className="auth-message" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            <p className="auth-eyebrow">{t('Did you know?')}</p>
            <div key={index} className="auth-message-body">
                <h2>{t(message.title)}</h2>
                <p>{t(message.text)}</p>
            </div>
            <div className="auth-dots">
                {MESSAGES.map((m, i) => (
                    <button key={m.title} type="button" className={i === index ? 'active' : ''} onClick={() => setIndex(i)}
                        aria-label={t('Message {n} of {total}', { n: i + 1, total: MESSAGES.length })} aria-current={i === index} />
                ))}
            </div>
        </div>
    );
}

// Login, registration and password pages: a red panel with messages beside the form.
export default function AuthLayout({ children }) {
    const { t } = useI18n();
    return (
        <div className="auth-shell">
            <aside className="auth-visual">
                <Cells />
                <Logo light tagline />
                <Messages />
                <p className="auth-visual-foot">{t('Online Blood Banking System · Institute of Finance Management · 2026')}</p>
            </aside>
            <main className="auth-main">
                <div className="auth-lang"><LanguageSwitch /></div>
                {children}
            </main>
        </div>
    );
}

// "Good morning" / "Good afternoon" / "Good evening" by the local time.
export function useGreeting() {
    const { t } = useI18n();
    const hour = new Date().getHours();
    if (hour < 12) return t('Good morning');
    if (hour < 17) return t('Good afternoon');
    return t('Good evening');
}
