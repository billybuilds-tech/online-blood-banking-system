import { translate } from './i18n.jsx';
import { getLang } from './lang.js';

export const BASE = import.meta.env.VITE_API_URL || '/api';
// Remove bearer sessions saved by earlier versions; browser sessions now use HttpOnly cookies.
try { localStorage.removeItem('obbs_token'); } catch { /* storage unavailable */ }
let csrfPromise;
async function csrfToken() {
    csrfPromise ||= fetch(`${BASE}/csrf-token`, { credentials: 'include' }).then(async (response) => {
        const data = await response.json();
        if (!response.ok || typeof data.token !== 'string') throw new Error('Could not prepare the request');
        return data.token;
    }).catch((error) => { csrfPromise = undefined; throw error; });
    return csrfPromise;
}

export class ApiError extends Error {
    constructor(status, data) {
        super(data?.error || translate('Request failed ({status})', { status }));
        this.status = status;
        this.data = data || {};
    }
}

export async function api(path, { method = 'GET', body } = {}, retryCsrf = true) {
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
    let res;
    try {
        const csrf = write ? await csrfToken() : undefined;
        res = await fetch(BASE + path, {
            method,
            credentials: 'include',
            headers: {
                'Accept-Language': getLang(),
                ...(body !== undefined || write ? { 'Content-Type': 'application/json' } : {}),
                ...(write ? { 'X-CSRF-Token': csrf } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
    } catch {
        throw new ApiError(0, { error: translate('Cannot reach the server. Check your internet connection.') });
    }

    let data = null;
    try { data = await res.json(); } catch { /* no body */ }

    if (write && retryCsrf && res.status === 403 && data?.code === 'CSRF_TOKEN_INVALID') {
        csrfPromise = undefined;
        return api(path, { method, body }, false);
    }
    if (res.status === 401 && !['/auth/login', '/auth/logout'].includes(path)) {
        window.dispatchEvent(new Event('obbs:logout'));
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
}
