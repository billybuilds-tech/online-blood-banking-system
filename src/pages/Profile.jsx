import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Badge, Card, Field } from '../components/ui.jsx';
import { BLOOD_TYPES, REGIONS, ROLE_LABELS, formatDate, todayString } from '../constants.js';
import { useAction } from '../hooks.js';

export default function Profile() {
    const { user, setUser } = useAuth();
    const details = useAction();
    const password = useAction();
    const [form, setForm] = useState({
        name: user.name || '',
        phone: user.phone || '',
        region: user.region || '',
        address: user.address || '',
        blood_type: user.blood_type || '',
        date_of_birth: user.date_of_birth || '',
    });
    const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    const isPerson = user.role === 'donor' || user.role === 'recipient';

    async function saveDetails(e) {
        e.preventDefault();
        const body = { name: form.name, phone: form.phone, region: form.region, address: form.address };
        if (isPerson) body.blood_type = form.blood_type;
        if (user.role === 'donor' && form.date_of_birth) body.date_of_birth = form.date_of_birth;
        const result = await details.run(() => api('/auth/me', { method: 'PUT', body }));
        if (result?.user) setUser(result.user);
    }

    async function savePassword(e) {
        e.preventDefault();
        if (pw.newPassword !== pw.confirm) {
            password.setMessage({ type: 'error', text: 'The new passwords do not match' });
            return;
        }
        const result = await password.run(() => api('/auth/me', {
            method: 'PUT', body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword },
        }), 'Password changed');
        if (result) setPw({ currentPassword: '', newPassword: '', confirm: '' });
    }

    return (
        <div className="page">
            <div className="page-head">
                <h1>My profile</h1>
                <p className="muted">
                    {ROLE_LABELS[user.role]} · {user.email} · member since {formatDate(user.created_at)}
                    {user.verified && <> · <Badge value="approved">Verified</Badge></>}
                </p>
            </div>

            <div className="two-col">
                <Card title="Details">
                    <form onSubmit={saveDetails} className="stack">
                        <Alert message={details.message} onClose={() => details.setMessage(null)} />
                        <Field label="Name"><input required value={form.name} onChange={set('name')} /></Field>
                        <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
                        <Field label="Region">
                            <select value={form.region} onChange={set('region')}>
                                <option value="">Select region</option>
                                {REGIONS.map((r) => <option key={r}>{r}</option>)}
                            </select>
                        </Field>
                        <Field label="Address"><input value={form.address} onChange={set('address')} /></Field>
                        {isPerson && (
                            <Field label="Blood type" hint={user.role === 'donor' && user.verified ? 'Confirmed by a blood bank' : undefined}>
                                <select value={form.blood_type} onChange={set('blood_type')} disabled={user.role === 'donor' && user.verified}>
                                    <option value="">Not known</option>
                                    {BLOOD_TYPES.map((t) => <option key={t}>{t}</option>)}
                                </select>
                            </Field>
                        )}
                        {user.role === 'donor' && (
                            <Field label="Date of birth">
                                <input type="date" max={todayString()} value={form.date_of_birth} onChange={set('date_of_birth')} />
                            </Field>
                        )}
                        <button className="btn btn-primary" disabled={details.busy}>Save changes</button>
                    </form>
                </Card>

                <Card title="Change password">
                    <form onSubmit={savePassword} className="stack">
                        <Alert message={password.message} onClose={() => password.setMessage(null)} />
                        <Field label="Current password">
                            <input type="password" required autoComplete="current-password" value={pw.currentPassword}
                                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
                        </Field>
                        <Field label="New password" hint="At least 8 characters with letters and numbers">
                            <input type="password" required minLength={8} autoComplete="new-password" value={pw.newPassword}
                                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
                        </Field>
                        <Field label="Confirm new password">
                            <input type="password" required minLength={8} autoComplete="new-password" value={pw.confirm}
                                onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                        </Field>
                        <button className="btn btn-primary" disabled={password.busy}>Change password</button>
                    </form>
                </Card>
            </div>
        </div>
    );
}
