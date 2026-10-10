import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { getLang } from './lang.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [logoutError, setLogoutError] = useState('');

    const clearSession = useCallback(() => {
        setUser(null);
        setLogoutError('');
    }, []);

    const logout = useCallback(async () => {
        setLogoutError('');
        try {
            await api('/auth/logout', { method: 'POST' });
            clearSession();
        } catch (error) {
            setLogoutError(error.message);
        }
    }, [clearSession]);

    const refresh = useCallback(async () => {
        const data = await api('/auth/me');
        setUser(data.user);
        return data.user;
    }, []);

    useEffect(() => {
        refresh().catch(clearSession).finally(() => setLoading(false));
        window.addEventListener('obbs:logout', clearSession);
        return () => window.removeEventListener('obbs:logout', clearSession);
    }, [refresh, clearSession]);

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
        setUser(data.user);
        return data.user;
    }, []);

    return (
        <AuthContext.Provider value={{ user, setUser, loading, login, logout, refresh, logoutError }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
