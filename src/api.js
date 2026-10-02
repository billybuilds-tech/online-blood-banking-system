export const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'obbs_token';

export function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
    constructor(status, data) {
        super(data?.error || `Request failed (${status})`);
        this.status = status;
        this.data = data || {};
    }
}

export async function api(path, { method = 'GET', body } = {}) {
    const token = getToken();
    let res;
    try {
        res = await fetch(BASE + path, {
            method,
            headers: {
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    } catch {
        throw new ApiError(0, { error: 'Cannot reach the server. Check your internet connection.' });
    }

    let data = null;
    try { data = await res.json(); } catch { /* no body */ }

    if (res.status === 401 && token) {
        window.dispatchEvent(new Event('obbs:logout'));
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
}
