import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../constants.js';
import { useI18n } from '../i18n.jsx';
import { useNotifications } from '../notifications.jsx';

// The list used by the bell's panel and by the notifications page. Clicking an item marks it read.
export function NotificationList({ items, onRead }) {
    const { t } = useI18n();
    return (
        <ul className="bell-list">
            {items.length === 0 && <li className="empty">{t('No notifications yet')}</li>}
            {items.map((n) => (
                <li key={n.id} className={n.is_read ? 'note' : 'note unread'} onClick={() => onRead(n)}>
                    <div className={`note-title cat-${n.category}`}>{n.title}</div>
                    <div className="note-msg">{n.message}</div>
                    <div className="note-meta">
                        {formatDateTime(n.sent_at)}
                        {n.sender_name && ` · ${n.sender_name}`}
                        {n.email_status === 'sent' && ` · ${t('Also sent to your email')}`}
                        {n.method === 'sms' && ' · SMS'}
                    </div>
                </li>
            ))}
        </ul>
    );
}

export default function NotificationBell() {
    const { t } = useI18n();
    const { items, unread, live, toast, markRead, markAll, dismissToast } = useNotifications();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    return (
        <div className="bell" ref={ref}>
            <button type="button" className="bell-button" onClick={() => setOpen((o) => !o)}
                aria-label={t('Notifications, {count} unread', { count: unread })}
                title={live ? t('Live: notifications arrive instantly') : t('Reconnecting… checking every 30 seconds')}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z" />
                </svg>
                {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
                <span className={live ? 'live-dot on' : 'live-dot'} aria-hidden="true" />
            </button>
            {open && (
                <div className="bell-panel">
                    <div className="bell-head">
                        <strong>{t('Notifications')}</strong>
                        {unread > 0 && <button type="button" className="link" onClick={markAll}>{t('Mark all read')}</button>}
                    </div>
                    <NotificationList items={items.slice(0, 20)} onRead={markRead} />
                    <Link to="/notifications" className="bell-all" onClick={() => setOpen(false)}>{t('See all notifications')}</Link>
                </div>
            )}
            {toast && !open && (
                <div className={`toast cat-${toast.category}`} role="status" onClick={() => { setOpen(true); dismissToast(); }}>
                    <div className="toast-title">{toast.title}</div>
                    <div className="toast-msg">{toast.message}</div>
                </div>
            )}
        </div>
    );
}
