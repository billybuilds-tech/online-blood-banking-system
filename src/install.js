import { useEffect, useReducer } from 'react';

/*
 * Installing the system as an app (PWA). The browser offers installation with a
 * beforeinstallprompt event, which must be caught as soon as the page loads; this module is
 * imported by main.jsx for that reason. useInstallApp() returns a function that shows the
 * browser's install dialog, or null when the browser does not offer it (already installed,
 * not supported, or not served from localhost or HTTPS).
 */
let offer = null;
const listeners = new Set();
const changed = () => listeners.forEach((listener) => listener());

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event;
    changed();
});
window.addEventListener('appinstalled', () => {
    offer = null;
    changed();
});

// Lets the page open without a connection and makes it installable (needs localhost or HTTPS).
export function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.isSecureContext) {
        window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
}

export function useInstallApp() {
    const [, refresh] = useReducer((n) => n + 1, 0);
    useEffect(() => {
        listeners.add(refresh);
        return () => listeners.delete(refresh);
    }, []);
    if (!offer) return null;
    return async () => {
        const current = offer;
        current.prompt();
        await current.userChoice;
        offer = null;
        changed();
    };
}
