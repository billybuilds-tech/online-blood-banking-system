import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { getLang } from './lang.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(Boolean(getToken()));

    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
    }, []);

    const refresh = useCallback(async () => {
        const data = await api('/auth/me');
        setUser(data.user);
        return data.user;
    }, []);

    useEffect(() => {
        if (getToken()) {
            refresh().catch(logout).finally(() => setLoading(false));
        }
        window.addEventListener('obbs:logout', logout);
        return () => window.removeEventListener('obbs:logout', logout);
    }, [refresh, logout]);

    // Emails are sent in the language the user last chose here, so the server is told when it changes.
    useEffect(() => {
        if (!user) return undefined;
        const sync = () => {
            if (user.language === getLang()) return;
            api('/auth/me', { method: 'PUT', body: { language: getLang() } }).then((data) => setUser(data.user)).catch(() => {});
        };
        sync();
        window.addEventListener('obbs:lang', sync);
        return () => window.removeEventListener('obbs:lang', sync);
    }, [user]);

    const login = useCallback(async (email, password) => {
        const data = await api('/auth/login', { method: 'POST', body: { email, password } });
        setToken(data.token);
        setUser(data.user);
        return data.user;
    }, []);

    return (
        <AuthContext.Provider value={{ user, setUser, loading, login, logout, refresh }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
