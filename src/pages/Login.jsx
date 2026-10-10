import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import AuthLayout, { useGreeting } from '../components/AuthLayout.jsx';
import { Alert, Field } from '../components/ui.jsx';
import { useI18n } from '../i18n.jsx';

export default function Login() {
    const { login } = useAuth();
    const { t } = useI18n();
    const greeting = useGreeting();
    const navigate = useNavigate();
    const location = useLocation();
    const [form, setForm] = useState({ email: '', password: '' });
    const [message, setMessage] = useState(location.state?.registered ? { type: 'success', text: t('Account created. You can now log in.') } : null);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            await login(form.email, form.password);
            navigate('/dashboard');
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout>
            <form className="auth-card" onSubmit={submit}>
                <div className="auth-head">
                    <p className="auth-greeting">{greeting}</p>
                    <h1>{t('Welcome back')}</h1>
                    <p className="muted">{t('Log in to continue saving lives.')}</p>
                </div>
                <Alert message={message} />
                <Field label={t('Email')}>
                    <input type="email" required autoComplete="email" value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label={t('Account password')}>
                    <input type="password" required autoComplete="current-password" value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </Field>
                <p className="auth-forgot"><Link to="/forgot-password">{t('Forgot your password?')}</Link></p>
                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('Logging in…') : t('Log in')}</button>
                <p className="auth-switch">{t('No account yet?')} <Link to="/register">{t('Register')}</Link></p>
            </form>
        </AuthLayout>
    );
}
