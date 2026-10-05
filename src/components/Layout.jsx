import { Suspense, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth.jsx';
import { ROLE_LABELS } from '../constants.js';
import { LanguageSwitch, useI18n } from '../i18n.jsx';
import { NavProvider, SECTIONS, useNavCounts } from '../nav.jsx';
import { NotificationsProvider, useNotifications } from '../notifications.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import NotificationBell from './NotificationBell.jsx';

// Every page after login: a side menu on the left and the chosen page on the right.
export default function Layout() {
    return (
        <NavProvider>
            <NotificationsProvider>
                <Shell />
            </NotificationsProvider>
        </NavProvider>
    );
}

function Shell() {
    const { user, logout } = useAuth();
    const { t } = useI18n();
    const { pathname } = useLocation();
    const counts = useNavCounts();
    const { unread } = useNotifications();
    // On small screens the menu slides in over the page.
    const [menuOpen, setMenuOpen] = useState(false);
    const close = () => setMenuOpen(false);

    useEffect(() => {
        if (!menuOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menuOpen]);

    const sections = SECTIONS[user.role];
    const [, page, sectionId] = pathname.split('/');
    const section = page === 'dashboard' ? (sections.find((s) => s.id === sectionId) ?? sections[0]) : null;
    let title = t('Notifications');
    if (section) title = t(section.label);
    else if (page === 'profile') title = t('Profile');

    const item = (to, icon, label, active, count) => (
        <Link key={to} to={to} className={active ? 'side-link active' : 'side-link'} aria-current={active ? 'page' : undefined} onClick={close}>
            <Icon name={icon} />
            <span className="side-label">{label}</span>
            {count > 0 && <span className="side-count">{count > 99 ? '99+' : count}</span>}
        </Link>
    );

    return (
        <div className={menuOpen ? 'shell menu-open' : 'shell'}>
            <aside className="sidebar" id="side-menu" aria-label={t('Main menu')}>
                <div className="side-head">
                    <Logo to="/dashboard" light size={26} onClick={close} />
                    <button type="button" className="side-close" onClick={close} aria-label={t('Close menu')}><Icon name="close" /></button>
                </div>
                <nav className="side-nav">
                    <div className="side-group">{t(ROLE_LABELS[user.role])}</div>
                    {sections.map((s) => item(`/dashboard/${s.id}`, s.icon, t(s.label), section?.id === s.id, counts[s.id]))}
                    <div className="side-group">{t('Account')}</div>
                    {item('/profile', 'user', t('Profile'), page === 'profile')}
                    {item('/notifications', 'bell', t('Notifications'), page === 'notifications', unread)}
                    <button type="button" className="side-link" onClick={logout}>
                        <Icon name="logout" />
                        <span className="side-label">{t('Log out')}</span>
                    </button>
                </nav>
                <div className="side-user">
                    <span className="side-avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
                    <span>
                        <span className="user-name">{user.name}</span>
                        <span className="user-role">{t(ROLE_LABELS[user.role])}</span>
                    </span>
                </div>
            </aside>
            <div className="side-backdrop" onClick={close} aria-hidden="true" />

            <div className="shell-main">
                <header className="topbar">
                    <button type="button" className="menu-button" onClick={() => setMenuOpen(true)}
                        aria-label={t('Open menu')} aria-controls="side-menu" aria-expanded={menuOpen}>
                        <Icon name="menu" size={22} />
                    </button>
                    <h2 className="topbar-title">{title}</h2>
                    <div className="topbar-right">
                        <LanguageSwitch />
                        <NotificationBell />
                    </div>
                </header>
                <main className="main">
                    <Suspense fallback={<div className="page-loading">{t('Loading…')}</div>}>
                        <Outlet />
                    </Suspense>
                </main>
                <footer className="footer">{t('Online Blood Banking System · Institute of Finance Management · 2026')}</footer>
            </div>
        </div>
    );
}
