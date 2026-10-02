import { Link, NavLink } from 'react-router';
import { useAuth } from '../auth.jsx';
import { ROLE_LABELS } from '../constants.js';
import { LanguageSwitch, useI18n } from '../i18n.jsx';
import NotificationBell from './NotificationBell.jsx';

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const { t } = useI18n();
    return (
        <div className="app">
            <header className="topbar">
                <Link to="/dashboard" className="brand">
                    <span className="brand-drop" aria-hidden="true" />
                    <span className="brand-text">{t('Online Blood Bank')}</span>
                </Link>
                <nav className="topnav">
                    <NavLink to="/dashboard">{t('Dashboard')}</NavLink>
                    <NavLink to="/profile">{t('Profile')}</NavLink>
                </nav>
                <div className="topbar-right">
                    <LanguageSwitch />
                    <NotificationBell />
                    <div className="user-chip">
                        <span className="user-name">{user.name}</span>
                        <span className="user-role">{t(ROLE_LABELS[user.role])}</span>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={logout}>{t('Log out')}</button>
                </div>
            </header>
            <main className="main">{children}</main>
            <footer className="footer">{t('Online Blood Banking System · Institute of Finance Management · 2026')}</footer>
        </div>
    );
}
