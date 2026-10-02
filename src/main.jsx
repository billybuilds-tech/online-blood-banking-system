import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { I18nProvider } from './i18n.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <I18nProvider>
            <BrowserRouter>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </BrowserRouter>
        </I18nProvider>
    </StrictMode>,
);
