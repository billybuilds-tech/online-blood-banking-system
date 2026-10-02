import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatDateTime } from '../constants.js';
import { useI18n } from '../i18n.jsx';
import { startLiveStream } from '../live.js';

const POLL_MS = 30_000; // fallback while the real-time stream is disconnected

export default function NotificationBell() {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [live, setLive] = useState(false);
    const [toast, setToast] = useState(null);
    const ref = useRef(null);
    const toastTimer = useRef(null);

    const load = useCallback(async () => {
        try {
            const data = await api('/notifications');
            setItems(data.notifications);
            setUnread(data.unread);
            return data.notifications;
        } catch {
            return null; // keep the last list
        }
    }, []);

    useEffect(() => {
        load();
        const stop = startLiveStream({
            onStatus: setLive,
            onEvent: async (event) => {
                const list = await load();
                const fresh = list?.find((n) => n.id === event.id);
                if (fresh) {
                    setToast(fresh);
                    clearTimeout(toastTimer.current);
                    toastTimer.current = setTimeout(() => setToast(null), 6000);
                }
                // Lets open dashboards reload their data (new request, booking, approval…).
                window.dispatchEvent(new CustomEvent('obbs:live', { detail: event }));
            },
        });
        // Notifications are translated by the server, so reload them when the language changes.
        window.addEventListener('obbs:lang', load);
        return () => {
            stop();
            clearTimeout(toastTimer.current);
            window.removeEventListener('obbs:lang', load);
        };
    }, [load]);

    // Poll only while the stream is down.
    useEffect(() => {
        if (live) return undefined;
        const timer = setInterval(load, POLL_MS);
        return () => clearInterval(timer);
    }, [live, load]);

    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    async function markRead(n) {
        if (n.is_read) return;
        await api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
        load();
    }

    async function markAll() {
        await api('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
        load();
    }

    const methodLabel = { email: t('Email'), sms: 'SMS' };

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
                    <ul className="bell-list">
                        {items.length === 0 && <li className="empty">{t('No notifications yet')}</li>}
                        {items.map((n) => (
                            <li key={n.id} className={n.is_read ? 'note' : 'note unread'} onClick={() => markRead(n)}>
                                <div className={`note-title cat-${n.category}`}>{n.title}</div>
                                <div className="note-msg">{n.message}</div>
                                <div className="note-meta">
                                    {formatDateTime(n.sent_at)}
                                    {n.sender_name && ` · ${n.sender_name}`}
                                    {n.method !== 'in_app' && ` · ${methodLabel[n.method] ?? n.method}`}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {toast && !open && (
                <div className={`toast cat-${toast.category}`} role="status" onClick={() => { setOpen(true); setToast(null); }}>
                    <div className="toast-title">{toast.title}</div>
                    <div className="toast-msg">{toast.message}</div>
                </div>
            )}
        </div>
    );
}
