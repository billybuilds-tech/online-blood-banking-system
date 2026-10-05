import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { startLiveStream } from './live.js';

const POLL_MS = 30_000; // fallback while the real-time stream is disconnected

const NotificationsContext = createContext(null);

/*
 * One list of the user's notifications for the bell, the side menu and the notifications page,
 * kept up to date by one real-time stream. A new notification also shows as a toast and lets the
 * open dashboard reload its data.
 */
export function NotificationsProvider({ children }) {
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [live, setLive] = useState(false);
    const [toast, setToast] = useState(null);
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

    const markRead = useCallback(async (n) => {
        if (n.is_read) return;
        await api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
        load();
    }, [load]);

    const markAll = useCallback(async () => {
        await api('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
        load();
    }, [load]);

    const value = useMemo(() => ({
        items, unread, live, toast, markRead, markAll, dismissToast: () => setToast(null),
    }), [items, unread, live, toast, markRead, markAll]);
    return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
    return useContext(NotificationsContext);
}
