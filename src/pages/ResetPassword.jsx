import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { Alert, Field } from '../components/ui.jsx';
import { LanguageSwitch, useI18n } from '../i18n.jsx';

// Step 2 of a password reset, opened from the emailed link (/reset-password?token=...).
export default function ResetPassword() {
    const { t } = useI18n();
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const [form, setForm] = useState({ password: '', confirm: '' });
    const [message, setMessage] = useState(token ? null : { type: 'error', text: t('This reset link is incomplete. Open the link from the email again, or ask for a new one.') });
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        if (form.password !== form.confirm) {
            setMessage({ type: 'error', text: t('The two passwords do not match') });
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            const data = await api('/auth/reset-password', { method: 'POST', body: { token, password: form.password } });
            setMessage({ type: 'success', text: data.message });
            setDone(true);
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-lang"><LanguageSwitch /></div>
            <form className="auth-card" onSubmit={submit}>
                <Link to="/" className="brand auth-brand">
                    <span className="brand-drop" aria-hidden="true" />
                    <span className="brand-text">{t('Online Blood Bank')}</span>
                </Link>
                <h1>{t('Choose a new password')}</h1>
                <Alert message={message} />
                {token && !done && <>
                    <Field label={t('New password')} hint={t('At least 8 characters with letters and numbers')}>
                        <input type="password" required minLength={8} autoComplete="new-password" value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </Field>
                    <Field label={t('Confirm new password')}>
                        <input type="password" required minLength={8} autoComplete="new-password" value={form.confirm}
                            onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
                    </Field>
                    <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('Saving…') : t('Save new password')}</button>
                </>}
                <p className="auth-switch">
                    {done || !token
                        ? <Link to={done ? '/login' : '/forgot-password'}>{done ? t('Log in') : t('Ask for a new link')}</Link>
                        : <Link to="/login">{t('Back to log in')}</Link>}
                </p>
            </form>
        </div>
    );
}
