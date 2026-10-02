import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

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
