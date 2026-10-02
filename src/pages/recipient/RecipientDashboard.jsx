import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import BanksStock from '../../components/BanksStock.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, Stat, TableWrap, Tabs } from '../../components/ui.jsx';
import { BLOOD_TYPES, COMPATIBILITY, formatDateTime } from '../../constants.js';
import { useAction, useApi, useLiveRefresh } from '../../hooks.js';

export default function RecipientDashboard() {
    const { user } = useAuth();
    const [tab, setTab] = useState('find');
    const requests = useApi('/blood-requests');
    useLiveRefresh(requests.reload);
    const pending = requests.data?.filter((r) => r.status === 'pending').length ?? 0;

    return (
        <div className="page">
            <div className="page-head">
                <h1>Welcome, {user.name.split(' ')[0]}</h1>
                <p className="muted">Recipient · Blood group <strong>{user.blood_type || 'not set'}</strong></p>
            </div>

            <div className="stats">
                <Stat label="Requests sent" value={requests.data?.length ?? '–'} />
                <Stat label="Pending" value={pending} tone={pending ? 'warn' : undefined} />
                <Stat label="Approved" value={requests.data?.filter((r) => r.status === 'approved').length ?? '–'} tone="good" />
                <Stat label="Units received" value={requests.data?.filter((r) => r.status === 'approved').reduce((s, r) => s + r.units, 0) ?? '–'} />
            </div>

            <Tabs active={tab} onChange={setTab} tabs={[
                { id: 'find', label: 'Find blood' },
                { id: 'request', label: 'Request blood' },
                { id: 'requests', label: 'My requests', count: pending },
            ]} />

            {tab === 'find' && <FindBlood bloodType={user.blood_type} />}
            {tab === 'request' && <RequestBlood defaultType={user.blood_type} onSent={() => { requests.reload(); setTab('requests'); }} />}
            {tab === 'requests' && <MyRequests state={requests} />}
        </div>
    );
}

function FindBlood({ bloodType }) {
    const [type, setType] = useState(bloodType || '');
    const compatible = useApi(type ? `/stock/compatible?bloodType=${encodeURIComponent(type)}` : null);

    return (
        <>
            <Card title="Who has blood I can receive?" actions={
                <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Blood group">
                    <option value="">Choose blood group</option>
                    {BLOOD_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
            }>
                {!type && <Empty>Choose the patient's blood group to see compatible stock.</Empty>}
                {type && (
                    <>
                        <p className="muted small">A {type} patient can receive red cells from: <strong>{COMPATIBILITY[type].join(', ')}</strong>. Exact matches are listed first.</p>
                        {compatible.loading && !compatible.data && <Loading />}
                        {compatible.data && !compatible.data.stock.length && <Empty>No compatible blood is in stock at any bank right now.</Empty>}
                        {compatible.data?.stock.length > 0 && (
                            <TableWrap>
                                <thead><tr><th>Blood bank</th><th>Region</th><th>Group</th><th>Units</th></tr></thead>
                                <tbody>
                                    {compatible.data.stock.map((s) => (
                                        <tr key={`${s.blood_bank_id}-${s.blood_type}`}>
                                            <td>{s.bank_name}</td>
                                            <td>{s.region}</td>
                                            <td><strong>{s.blood_type}</strong>{s.blood_type === type && <Badge value="approved">exact</Badge>}</td>
                                            <td>{s.units}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        )}
                    </>
                )}
            </Card>
            <BanksStock highlight={type ? COMPATIBILITY[type] : []} />
        </>
    );
}

function RequestBlood({ defaultType, onSent }) {
    const banks = useApi('/users?role=bloodbank');
    const action = useAction();
    const [form, setForm] = useState({ blood_bank_id: '', blood_type: defaultType || '', units: 1, urgency: 'normal', reason: '' });
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function submit(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/blood-requests', { method: 'POST', body: { ...form, units: Number(form.units) } }));
        if (ok) setTimeout(onSent, 900);
    }

    return (
        <Card title="Request blood">
            <form className="stack narrow" onSubmit={submit}>
                <Alert message={action.message} onClose={() => action.setMessage(null)} />
                <Field label="Blood bank">
                    <select required value={form.blood_bank_id} onChange={set('blood_bank_id')}>
                        <option value="">Select a blood bank</option>
                        {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}{b.region ? ` — ${b.region}` : ''}</option>)}
                    </select>
                </Field>
                <div className="form-grid">
                    <Field label="Blood group">
                        <select required value={form.blood_type} onChange={set('blood_type')}>
                            <option value="">Select</option>
                            {BLOOD_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                    </Field>
                    <Field label="Units">
                        <input type="number" min={1} max={20} required value={form.units} onChange={set('units')} />
                    </Field>
                </div>
                <Field label="Urgency">
                    <div className="segmented">
                        {['normal', 'urgent', 'critical'].map((u) => (
                            <button type="button" key={u} className={form.urgency === u ? `seg active seg-${u}` : 'seg'} onClick={() => setForm({ ...form, urgency: u })}>{u}</button>
                        ))}
                    </div>
                </Field>
                <Field label="Reason / hospital (optional)">
                    <textarea rows={3} maxLength={255} value={form.reason} onChange={set('reason')} placeholder="e.g. Surgery at Muhimbili, ward 5" />
                </Field>
                <button className="btn btn-primary" disabled={action.busy}>{action.busy ? 'Sending…' : 'Send request'}</button>
            </form>
        </Card>
    );
}

function MyRequests({ state }) {
    if (state.loading && !state.data) return <Loading />;
    if (!state.data?.length) return <Card><Empty>You have not requested blood yet.</Empty></Card>;
    return (
        <Card title="My requests" actions={<button type="button" className="btn btn-sm btn-ghost" onClick={state.reload}>Refresh</button>}>
            <TableWrap>
                <thead><tr><th>Sent</th><th>Blood bank</th><th>Group</th><th>Units</th><th>Urgency</th><th>Status</th><th>Note</th></tr></thead>
                <tbody>
                    {state.data.map((r) => (
                        <tr key={r.id}>
                            <td>{formatDateTime(r.created_at)}</td>
                            <td>{r.bank_name}</td>
                            <td>{r.blood_type}</td>
                            <td>{r.units}</td>
                            <td><Badge value={r.urgency} /></td>
                            <td><Badge value={r.status} /></td>
                            <td className="muted">{r.rejection_reason || ''}</td>
                        </tr>
                    ))}
                </tbody>
            </TableWrap>
        </Card>
    );
}
