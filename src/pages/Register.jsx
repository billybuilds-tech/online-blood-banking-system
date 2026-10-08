import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Field } from '../components/ui.jsx';
import PhoneInput from '../components/PhoneInput.jsx';
import { BLOOD_TYPES, REGIONS, todayString } from '../constants.js';
import { useI18n } from '../i18n.jsx';

const ROLE_OPTIONS = [
    { id: 'donor', label: 'Donor', text: 'I want to donate blood' },
    { id: 'recipient', label: 'Recipient', text: 'I need blood for a patient' },
    { id: 'bloodbank', label: 'Blood bank', text: 'I register a blood bank' },
];

export default function Register() {
    const { t } = useI18n();
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
            setMessage({ type: 'error', text: t('The two passwords do not match') });
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
                navigate('/login', { replace: true, state: { registered: true } });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setBusy(false);
        }
    }

    const isBank = role === 'bloodbank';

    return (
        <AuthLayout>
            <form className="auth-card auth-wide" onSubmit={submit}>
                <div className="auth-head">
                    <h1>{t('Create an account')}</h1>
                    <p className="muted">{t('Join the donors, patients and blood banks working together to save lives. It is free.')}</p>
                </div>

                <div className="role-picker" role="radiogroup" aria-label={t('Account type')}>
                    {ROLE_OPTIONS.map((r) => (
                        <button type="button" key={r.id} role="radio" aria-checked={role === r.id}
                            className={role === r.id ? 'role-option active' : 'role-option'} onClick={() => setRole(r.id)}>
                            <strong>{t(r.label)}</strong>
                            <span>{t(r.text)}</span>
                        </button>
                    ))}
                </div>

                <Alert message={message} />

                <div className="form-grid">
                    <Field label={isBank ? t('Blood bank name') : t('Full name')}>
                        <input required value={form.name} onChange={set('name')} autoComplete={isBank ? 'organization' : 'name'} />
                    </Field>
                    <Field label={t('Email')}>
                        <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
                    </Field>
                    <Field label={t('Phone')}>
                        <PhoneInput value={form.phone} onChange={set('phone')} />
                    </Field>
                    <Field label={t('Region')}>
                        <select value={form.region} onChange={set('region')} required={isBank}>
                            <option value="">{t('Select region')}</option>
                            {REGIONS.map((r) => <option key={r}>{r}</option>)}
                        </select>
                    </Field>

                    {!isBank && (
                        <Field label={t('Blood type')} hint={role === 'recipient'
                            ? t('Blood group of the patient, if known')
                            : t('Enter the group you know; a blood bank confirms it with a test at your first donation.')}>
                            <select value={form.blood_type} onChange={set('blood_type')} required={role === 'donor'}>
                                <option value="">{role === 'donor' ? t('Select blood type') : t('Not known')}</option>
                                {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                            </select>
                        </Field>
                    )}
                    {role === 'donor' && (
                        <Field label={t('Date of birth')} hint={t('Donors must be 18 to 65 years old')}>
                            <input type="date" required max={todayString()} value={form.date_of_birth} onChange={set('date_of_birth')} />
                        </Field>
                    )}
                    {isBank && (
                        <>
                            <Field label={t('Address')}>
                                <input value={form.address} onChange={set('address')} autoComplete="street-address" />
                            </Field>
                            <Field label={t('Licence / registration number')}>
                                <input value={form.license_number} onChange={set('license_number')} />
                            </Field>
                        </>
                    )}

                    <Field label={t('Password')} hint={t('At least 8 characters with letters and numbers')}>
                        <input type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />
                    </Field>
                    <Field label={t('Confirm password')}>
                        <input type="password" required minLength={8} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
                    </Field>
                </div>

                {isBank && <p className="muted">{t('Blood bank accounts can log in after the Blood Bank Manager approves them.')}</p>}

                <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('Creating account…') : t('Register')}</button>
                <p className="auth-switch">{t('Already registered?')} <Link to="/login">{t('Log in')}</Link></p>
            </form>
        </AuthLayout>
    );
}
