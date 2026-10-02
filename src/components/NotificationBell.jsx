import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatDateTime } from '../constants.js';

const POLL_MS = 30_000; // open pages check for new notifications every 30 seconds

export default function NotificationBell() {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const ref = useRef(null);

    const load = useCallback(async () => {
        try {
            const data = await api('/notifications');
            setItems(data.notifications);
            setUnread(data.unread);
        } catch { /* keep the last list */ }
    }, []);

    useEffect(() => {
        load();
        const timer = setInterval(load, POLL_MS);
        return () => clearInterval(timer);
    }, [load]);

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

    return (
        <div className="bell" ref={ref}>
            <button type="button" className="bell-button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unread} unread`}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z" />
                </svg>
                {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
            </button>
            {open && (
                <div className="bell-panel">
                    <div className="bell-head">
                        <strong>Notifications</strong>
                        {unread > 0 && <button type="button" className="link" onClick={markAll}>Mark all read</button>}
                    </div>
                    <ul className="bell-list">
                        {items.length === 0 && <li className="empty">No notifications yet</li>}
                        {items.map((n) => (
                            <li key={n.id} className={n.is_read ? 'note' : 'note unread'} onClick={() => markRead(n)}>
                                <div className={`note-title cat-${n.category}`}>{n.title}</div>
                                <div className="note-msg">{n.message}</div>
                                <div className="note-meta">
                                    {formatDateTime(n.sent_at)}
                                    {n.sender_name && ` · ${n.sender_name}`}
                                    {n.method !== 'in_app' && ` · ${n.method.toUpperCase()}`}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
