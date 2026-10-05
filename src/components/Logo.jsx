import { useId } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n.jsx';

// The system's mark: a drop of blood with a heartbeat line across it.
export function LogoMark({ size = 34 }) {
    const id = useId();
    return (
        <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="logo-mark">
            <defs>
                <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0.35" y2="1">
                    <stop offset="0" stopColor="#ef5a5f" />
                    <stop offset="1" stopColor="#9b1622" />
                </linearGradient>
            </defs>
            <path d="M24 3.5C24 3.5 9 19.6 9 30.2a15 15 0 0 0 30 0C39 19.6 24 3.5 24 3.5z" fill={`url(#${id}-fill)`} />
            <path d="M17.5 21.5c1.4-3 3.4-6 5.2-8.3" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M11.5 31.5h6.5l2.6-5.5 4 10.5 2.8-7.5 2 2.5h7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Mark and name, linking to `to`. light: white text for dark backgrounds; tagline: a line under the name.
export default function Logo({ to = '/', light = false, tagline = false, size = 34, onClick }) {
    const { t } = useI18n();
    return (
        <Link to={to} className={light ? 'logo logo-light' : 'logo'} onClick={onClick}>
            <LogoMark size={size} />
            <span className="logo-words">
                <span className="logo-name">{t('Online Blood Bank')}</span>
                {tagline && <span className="logo-tagline">{t('Blood banking for Tanzania')}</span>}
            </span>
        </Link>
    );
}
