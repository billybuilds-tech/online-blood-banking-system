import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Field } from '../components/ui.jsx';
import { useI18n } from '../i18n.jsx';

// Step 1 of a password reset: the server emails a single-use link to the account's address.
export default function ForgotPassword() {
    const { t } = useI18n();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState(null);
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            const data = await api('/auth/forgot-password', { method: 'POST', body: { email } });
            setMessage({ type: 'success', text: data.message });
            setSent(true);
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout>
            <form className="auth-card" onSubmit={submit}>
                <h1>{t('Forgot your password?')}</h1>
                <Alert message={message} />
                {!sent && <>
                    <p className="muted small">{t('Enter the email you registered with. We will send you a link to choose a new password.')}</p>
                    <Field label={t('Email')}>
                        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </Field>
                    <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('Sending…') : t('Send reset link')}</button>
                </>}
                {sent && <p className="muted small">{t('Check your inbox, and the spam folder. You can close this page.')}</p>}
                <p className="auth-switch"><Link to="/login">{t('Back to log in')}</Link></p>
            </form>
        </AuthLayout>
    );
}
