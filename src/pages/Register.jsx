import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { Alert, Field } from '../components/ui.jsx';
import { BLOOD_TYPES, REGIONS, todayString } from '../constants.js';

const ROLE_OPTIONS = [
    { id: 'donor', label: 'Donor', text: 'I want to donate blood' },
    { id: 'recipient', label: 'Recipient', text: 'I need blood for a patient' },
    { id: 'bloodbank', label: 'Blood bank', text: 'I register a blood bank' },
];

export default function Register() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [role, setRole] = useState(ROLE_OPTIONS.some((r) => r.id === params.get('role')) ? params.get('role') : 'donor');
    const [form, setForm] = useState({
        name: '', email: '', phone: '', password: '', confirm: '',
        blood_type: '', date_of_birth: '', region: '', address: '', license_number: '',
    });
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);

    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function submit(e) {
        e.preventDefault();
        if (form.password !== form.confirm) {
            setMessage({ type: 'error', text: 'The two passwords do not match' });
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            const { confirm: _confirm, ...body } = form;
            const data = await api('/auth/register', { method: 'POST', body: { ...body, role } });
            if (role === 'bloodbank') {
                setMessage({ type: 'success', text: data.message });
            } else {
                navigate('/login', { replace: true });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    const isBank = role === 'bloodbank';

    return (
        <div className="auth-page">
            <form className="auth-card auth-wide" onSubmit={submit}>
                <Link to="/" className="brand auth-brand">
                    <span className="brand-drop" aria-hidden="true" />
                    <span className="brand-text">Online Blood Bank</span>
                </Link>
                <h1>Create an account</h1>

                <div className="role-picker" role="radiogroup" aria-label="Account type">
                    {ROLE_OPTIONS.map((r) => (
                        <button type="button" key={r.id} role="radio" aria-checked={role === r.id}
                            className={role === r.id ? 'role-option active' : 'role-option'} onClick={() => setRole(r.id)}>
                            <strong>{r.label}</strong>
                            <span>{r.text}</span>
                        </button>
                    ))}
                </div>

                <Alert message={message} />

                <div className="form-grid">
                    <Field label={isBank ? 'Blood bank name' : 'Full name'}>
                        <input required value={form.name} onChange={set('name')} autoComplete={isBank ? 'organization' : 'name'} />
                    </Field>
                    <Field label="Email">
                        <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
                    </Field>
                    <Field label="Phone">
                        <input type="tel" value={form.phone} onChange={set('phone')} placeholder="07XX XXX XXX" autoComplete="tel" />
                    </Field>
                    <Field label="Region">
                        <select value={form.region} onChange={set('region')} required={isBank}>
                            <option value="">Select region</option>
                            {REGIONS.map((r) => <option key={r}>{r}</option>)}
                        </select>
                    </Field>

                    {!isBank && (
                        <Field label="Blood type" hint={role === 'recipient' ? 'Blood group of the patient, if known' : undefined}>
                            <select value={form.blood_type} onChange={set('blood_type')} required={role === 'donor'}>
                                <option value="">{role === 'donor' ? 'Select blood type' : 'Not known'}</option>
                                {BLOOD_TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select>
                        </Field>
                    )}
                    {role === 'donor' && (
                        <Field label="Date of birth" hint="Donors must be 18 to 65 years old">
                            <input type="date" required max={todayString()} value={form.date_of_birth} onChange={set('date_of_birth')} />
                        </Field>
                    )}
                    {isBank && (
                        <>
                            <Field label="Address">
                                <input value={form.address} onChange={set('address')} autoComplete="street-address" />
                            </Field>
                            <Field label="Licence / registration number">
                                <input value={form.license_number} onChange={set('license_number')} />
                            </Field>
                        </>
                    )}

                    <Field label="Password" hint="At least 8 characters with letters and numbers">
                        <input type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />
                    </Field>
                    <Field label="Confirm password">
                        <input type="password" required minLength={8} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
                    </Field>
                </div>

                {isBank && <p className="muted">Blood bank accounts can log in after the Blood Bank Manager approves them.</p>}

                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating account…' : 'Register'}</button>
                <p className="auth-switch">Already registered? <Link to="/login">Log in</Link></p>
            </form>
        </div>
    );
}
