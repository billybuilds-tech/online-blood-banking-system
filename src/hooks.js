import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { translate } from './i18n.jsx';

// Loads a GET endpoint and exposes reload() for refreshing after an action.
export function useApi(path) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(Boolean(path));

    const reload = useCallback(async () => {
        if (!path) return;
        setLoading(true);
        try {
            setData(await api(path));
            setError('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [path]);

    useEffect(() => { reload(); }, [reload]);

    return { data, error, loading, reload, setData };
}

// Calls refresh whenever a real-time notification arrives, so dashboards update without a page reload.
export function useLiveRefresh(refresh) {
    useEffect(() => {
        window.addEventListener('obbs:live', refresh);
        return () => window.removeEventListener('obbs:live', refresh);
    }, [refresh]);
}

// Runs an action, keeps a success/error message, and returns whether it succeeded.
export function useAction() {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);

    const run = useCallback(async (fn, successText) => {
        setBusy(true);
        setMessage(null);
        try {
            const result = await fn();
            setMessage({ type: 'success', text: successText || result?.message || translate('Done') });
            return result ?? true;
        } catch (err) {
            setMessage({ type: 'error', text: err.message, data: err.data });
            return null;
        } finally {
            setBusy(false);
        }
    }, []);

    return { busy, message, setMessage, run };
}
