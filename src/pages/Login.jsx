import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import { Alert, Field } from '../components/ui.jsx';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [message, setMessage] = useState(null);
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
        <div className="auth-page">
            <form className="auth-card" onSubmit={submit}>
                <Link to="/" className="brand auth-brand">
                    <span className="brand-drop" aria-hidden="true" />
                    <span className="brand-text">Online Blood Bank</span>
                </Link>
                <h1>Log in</h1>
                <Alert message={message} />
                <Field label="Email">
                    <input type="email" required autoComplete="email" value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Password">
                    <input type="password" required autoComplete="current-password" value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </Field>
                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
                <p className="auth-switch">No account yet? <Link to="/register">Register</Link></p>
            </form>
        </div>
    );
}
