import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import StockGrid from '../../components/StockGrid.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, Stat, TableWrap, Tabs } from '../../components/ui.jsx';
import { BLOOD_TYPES, COLLECTION_LABELS, LOW_STOCK, VOLUME, classifyCollection, formatDate, formatDateTime } from '../../constants.js';
import { useAction, useApi } from '../../hooks.js';

export default function BloodBankDashboard() {
    const { user } = useAuth();
    const [tab, setTab] = useState('overview');
    const stock = useApi(`/stock?bankId=${user.id}`);
    const appointments = useApi('/appointments');
    const requests = useApi('/blood-requests');
    const transfers = useApi('/inter-bank-requests');
    const donations = useApi('/donations');

    const reloadAll = () => { stock.reload(); appointments.reload(); requests.reload(); transfers.reload(); donations.reload(); };
    const pendingAppointments = appointments.data?.filter((a) => a.status === 'pending' || a.status === 'approved').length ?? 0;
    const pendingRequests = requests.data?.filter((r) => r.status === 'pending').length ?? 0;
    const incomingTransfers = transfers.data?.filter((t) => t.status === 'pending' && t.to_bank_id === user.id).length ?? 0;

    return (
        <div className="page">
            <div className="page-head">
                <h1>{user.name}</h1>
                <p className="muted">Blood Bank Module · {user.region}</p>
            </div>

            <Tabs active={tab} onChange={setTab} tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'stock', label: 'Stock' },
                { id: 'appointments', label: 'Donations', count: pendingAppointments },
                { id: 'requests', label: 'Blood requests', count: pendingRequests },
                { id: 'transfers', label: 'Inter-bank', count: incomingTransfers },
                { id: 'transactions', label: 'Transactions' },
            ]} />

            {tab === 'overview' && (
                <Overview stock={stock.data} pendingAppointments={pendingAppointments} pendingRequests={pendingRequests}
                    incomingTransfers={incomingTransfers} donations={donations.data} requests={requests.data} goTo={setTab} />
            )}
            {tab === 'stock' && <StockManager stock={stock} />}
            {tab === 'appointments' && <AppointmentsPanel state={appointments} onChange={reloadAll} />}
            {tab === 'requests' && <RequestsPanel state={requests} onChange={reloadAll} />}
            {tab === 'transfers' && <TransfersPanel state={transfers} stock={stock.data} onChange={reloadAll} />}
            {tab === 'transactions' && <Transactions donations={donations.data} requests={requests.data} transfers={transfers.data} bankId={user.id} />}
        </div>
    );
}

function Overview({ stock, pendingAppointments, pendingRequests, incomingTransfers, donations, requests, goTo }) {
    const total = stock?.reduce((s, r) => s + r.units, 0) ?? 0;
    const low = stock?.filter((r) => r.units < LOW_STOCK) ?? [];
    const urgent = requests?.filter((r) => r.status === 'pending' && r.urgency !== 'normal') ?? [];
    return (
        <>
            <div className="stats">
                <Stat label="Units in stock" value={stock ? total : '–'} />
                <Stat label="Low-stock groups" value={stock ? low.length : '–'} tone={low.length ? 'warn' : 'good'} hint={low.map((l) => l.blood_type).join(', ')} />
                <Stat label="Pending requests" value={pendingRequests} tone={urgent.length ? 'bad' : undefined} hint={urgent.length ? `${urgent.length} urgent` : undefined} />
                <Stat label="Donations verified" value={donations?.length ?? '–'} />
            </div>
            <Card title="Current stock">
                {stock ? <StockGrid rows={stock} /> : <Loading />}
            </Card>
            <Card title="Needs your attention">
                <ul className="todo">
                    <li><button type="button" className="link" onClick={() => goTo('requests')}>{pendingRequests} blood request(s) waiting</button></li>
                    <li><button type="button" className="link" onClick={() => goTo('appointments')}>{pendingAppointments} donation appointment(s) open</button></li>
                    <li><button type="button" className="link" onClick={() => goTo('transfers')}>{incomingTransfers} inter-bank request(s) from other banks</button></li>
                </ul>
            </Card>
        </>
    );
}

function StockManager({ stock }) {
    const action = useAction();
    const [form, setForm] = useState({ blood_type: 'O+', units: 1, mode: 'add' });

    async function submit(e) {
        e.preventDefault();
        const body = { blood_type: form.blood_type, units: Number(form.units) };
        const ok = await action.run(() => api('/stock', { method: form.mode === 'add' ? 'POST' : 'PUT', body }));
        if (ok) stock.reload();
    }

    return (
        <div className="two-col">
            <Card title="Stock by blood group">
                {stock.data ? <StockGrid rows={stock.data} /> : <Loading />}
                {stock.data && (
                    <TableWrap>
                        <thead><tr><th>Group</th><th>Units</th><th>Last updated</th></tr></thead>
                        <tbody>
                            {stock.data.map((s) => (
                                <tr key={s.id}><td>{s.blood_type}</td><td>{s.units} {s.low && <Badge value="low">low</Badge>}</td><td>{formatDateTime(s.last_updated)}</td></tr>
                            ))}
                        </tbody>
                    </TableWrap>
                )}
            </Card>
            <Card title="Update stock">
                <form className="stack" onSubmit={submit}>
                    <Alert message={action.message} onClose={() => action.setMessage(null)} />
                    <div className="segmented">
                        <button type="button" className={form.mode === 'add' ? 'seg active' : 'seg'} onClick={() => setForm({ ...form, mode: 'add' })}>Add units</button>
                        <button type="button" className={form.mode === 'set' ? 'seg active' : 'seg'} onClick={() => setForm({ ...form, mode: 'set' })}>Correct count</button>
                    </div>
                    <Field label="Blood group">
                        <select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })}>
                            {BLOOD_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                    </Field>
                    <Field label={form.mode === 'add' ? 'Units to add' : 'Counted units'}>
                        <input type="number" min={form.mode === 'add' ? 1 : 0} required value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
                    </Field>
                    <p className="muted small">
                        {form.mode === 'add'
                            ? 'Use for blood received outside the donation workflow. Verified donations are added automatically.'
                            : 'Use after a physical count to correct the recorded stock.'}
                    </p>
                    <button className="btn btn-primary" disabled={action.busy}>Save</button>
                </form>
            </Card>
        </div>
    );
}

// Inline form for the measured volume; shows how the collection will be classified before saving.
function VerifyDonation({ busy, onSave, onCancel }) {
    const [volume, setVolume] = useState(String(VOLUME.BAG));
    const ml = Number(volume);
    const valid = volume !== '' && Number.isInteger(ml) && ml >= 0;
    const kind = valid ? classifyCollection(ml) : null;

    return (
        <form className="verify-form" onSubmit={(e) => { e.preventDefault(); if (valid && kind !== 'over_volume') onSave(ml); }}>
            <label className="verify-input">
                <input type="number" min={0} max={VOLUME.STANDARD_MAX} step={1} required autoFocus
                    value={volume} onChange={(e) => setVolume(e.target.value)} aria-label="Collected volume in mL" />
                <span>mL</span>
            </label>
            {kind && <Badge value={kind}>{COLLECTION_LABELS[kind]}</Badge>}
            <button className="btn btn-sm btn-primary" disabled={busy || !valid || kind === 'over_volume'}>Save</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>
        </form>
    );
}

function AppointmentsPanel({ state, onChange }) {
    const action = useAction();
    const [filter, setFilter] = useState('open');
    const [verifying, setVerifying] = useState(null);

    async function update(a, status, extra = {}) {
        let rejection_reason;
        if (status === 'rejected') {
            rejection_reason = window.prompt('Reason for rejecting (optional):') ?? '';
        }
        const ok = await action.run(() => api(`/appointments/${a.id}/status`, { method: 'PATCH', body: { status, rejection_reason, ...extra } }));
        if (ok) { setVerifying(null); onChange(); }
    }

    const rows = (state.data || []).filter((a) => filter === 'all' || a.status === 'pending' || a.status === 'approved');

    return (
        <Card title="Donation appointments" actions={
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
                <option value="open">Open</option>
                <option value="all">All</option>
            </select>
        }>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            {state.loading && !state.data && <Loading />}
            {state.data && !rows.length && <Empty>No appointments to show.</Empty>}
            {rows.length > 0 && (
                <TableWrap>
                    <thead><tr><th>Date</th><th>Donor</th><th>Group</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        {rows.map((a) => (
                            <tr key={a.id}>
                                <td>{formatDate(a.appointment_date)}</td>
                                <td>{a.donor_name}{a.notes && <div className="muted small">{a.notes}</div>}</td>
                                <td>{a.blood_type}</td>
                                <td>{a.donor_phone || '-'}</td>
                                <td><Badge value={a.status} /></td>
                                <td className="actions">
                                    {a.status === 'pending' && <>
                                        <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => update(a, 'approved')}>Approve</button>
                                        <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => update(a, 'rejected')}>Reject</button>
                                    </>}
                                    {a.status === 'approved' && verifying === a.id && (
                                        <VerifyDonation busy={action.busy} onCancel={() => setVerifying(null)}
                                            onSave={(volume_ml) => update(a, 'completed', { volume_ml })} />
                                    )}
                                    {a.status === 'approved' && verifying !== a.id && <>
                                        <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => setVerifying(a.id)}>Verify donation</button>
                                        <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => update(a, 'rejected')}>Not collected</button>
                                    </>}
                                    {a.status === 'completed' && a.collected_volume_ml != null && (
                                        <span className="muted small">{a.collected_volume_ml} mL</span>
                                    )}
                                    {a.rejection_reason && <span className="muted small">{a.rejection_reason}</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
            <p className="muted small">
                When verifying, enter the measured volume. {VOLUME.STANDARD_MIN}–{VOLUME.STANDARD_MAX} mL is a standard unit;
                {' '}{VOLUME.LOW_MIN}–{VOLUME.STANDARD_MIN - 1} mL is a low-volume unit for red cells only; below {VOLUME.LOW_MIN} mL
                {' '}is an incomplete collection and is not added to stock.
            </p>
        </Card>
    );
}

function RequestsPanel({ state, onChange }) {
    const action = useAction();
    const [filter, setFilter] = useState('pending');

    async function update(r, status) {
        let rejection_reason;
        if (status === 'rejected') rejection_reason = window.prompt('Reason for rejecting (optional):') ?? '';
        const ok = await action.run(() => api(`/blood-requests/${r.id}/status`, { method: 'PATCH', body: { status, rejection_reason } }));
        if (ok) onChange();
    }

    const rows = (state.data || []).filter((r) => filter === 'all' || r.status === filter);

    return (
        <Card title="Blood requests from recipients" actions={
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
            </select>
        }>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            {state.loading && !state.data && <Loading />}
            {state.data && !rows.length && <Empty>No requests to show.</Empty>}
            {rows.length > 0 && (
                <TableWrap>
                    <thead><tr><th>Received</th><th>Recipient</th><th>Group</th><th>Units</th><th>Urgency</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id} className={r.status === 'pending' && r.urgency !== 'normal' ? 'row-urgent' : ''}>
                                <td>{formatDateTime(r.created_at)}</td>
                                <td>{r.recipient_name}<div className="muted small">{[r.recipient_phone, r.reason].filter(Boolean).join(' · ')}</div></td>
                                <td>{r.blood_type}</td>
                                <td>{r.units}</td>
                                <td><Badge value={r.urgency} /></td>
                                <td><Badge value={r.status} /></td>
                                <td className="actions">
                                    {r.status === 'pending' ? <>
                                        <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => update(r, 'approved')}>Approve</button>
                                        <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => update(r, 'rejected')}>Reject</button>
                                    </> : <span className="muted small">{r.rejection_reason || ''}</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
        </Card>
    );
}

function TransfersPanel({ state, stock, onChange }) {
    const { user } = useAuth();
    const banks = useApi('/users?role=bloodbank');
    const action = useAction();
    const [form, setForm] = useState({ to_bank_id: '', blood_type: 'O+', units: 1, urgency: 'normal', notes: '' });
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    const incoming = (state.data || []).filter((t) => t.to_bank_id === user.id);
    const outgoing = (state.data || []).filter((t) => t.from_bank_id === user.id);
    const myUnits = Object.fromEntries((stock || []).map((s) => [s.blood_type, s.units]));

    async function send(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/inter-bank-requests', { method: 'POST', body: { ...form, units: Number(form.units) } }));
        if (ok) { setForm({ ...form, units: 1, notes: '' }); onChange(); }
    }

    async function respond(t, status) {
        let rejection_reason;
        if (status === 'rejected') rejection_reason = window.prompt('Reason for declining (optional):') ?? '';
        const ok = await action.run(() => api(`/inter-bank-requests/${t.id}/status`, { method: 'PATCH', body: { status, rejection_reason } }));
        if (ok) onChange();
    }

    return (
        <>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            <div className="two-col">
                <Card title="Ask another bank for blood">
                    <form className="stack" onSubmit={send}>
                        <Field label="Supplying blood bank">
                            <select required value={form.to_bank_id} onChange={set('to_bank_id')}>
                                <option value="">Select a blood bank</option>
                                {banks.data?.filter((b) => b.id !== user.id).map((b) => <option key={b.id} value={b.id}>{b.name}{b.region ? ` — ${b.region}` : ''}</option>)}
                            </select>
                        </Field>
                        <div className="form-grid">
                            <Field label="Blood group">
                                <select value={form.blood_type} onChange={set('blood_type')}>
                                    {BLOOD_TYPES.map((t) => <option key={t}>{t}</option>)}
                                </select>
                            </Field>
                            <Field label="Units">
                                <input type="number" min={1} max={200} required value={form.units} onChange={set('units')} />
                            </Field>
                        </div>
                        <Field label="Urgency">
                            <select value={form.urgency} onChange={set('urgency')}>
                                <option value="normal">Normal</option>
                                <option value="urgent">Urgent</option>
                                <option value="critical">Critical</option>
                            </select>
                        </Field>
                        <Field label="Notes (optional)"><input value={form.notes} onChange={set('notes')} maxLength={255} /></Field>
                        <button className="btn btn-primary" disabled={action.busy}>Send request</button>
                    </form>
                </Card>

                <Card title="Requests from other banks">
                    {!incoming.length && <Empty>No requests from other banks.</Empty>}
                    {incoming.length > 0 && (
                        <TableWrap>
                            <thead><tr><th>From</th><th>Group</th><th>Units</th><th>You hold</th><th>Status</th><th /></tr></thead>
                            <tbody>
                                {incoming.map((t) => (
                                    <tr key={t.id} className={t.status === 'pending' && t.urgency !== 'normal' ? 'row-urgent' : ''}>
                                        <td>{t.from_bank_name}<div className="muted small">{formatDateTime(t.created_at)} · <Badge value={t.urgency} /></div></td>
                                        <td>{t.blood_type}</td>
                                        <td>{t.units}</td>
                                        <td>{myUnits[t.blood_type] ?? 0}</td>
                                        <td><Badge value={t.status} /></td>
                                        <td className="actions">
                                            {t.status === 'pending' && <>
                                                <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => respond(t, 'approved')}>Supply</button>
                                                <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => respond(t, 'rejected')}>Decline</button>
                                            </>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    )}
                </Card>
            </div>

            <Card title="My requests to other banks">
                {!outgoing.length && <Empty>You have not asked other banks for blood.</Empty>}
                {outgoing.length > 0 && (
                    <TableWrap>
                        <thead><tr><th>Sent</th><th>To</th><th>Group</th><th>Units</th><th>Urgency</th><th>Status</th><th>Note</th></tr></thead>
                        <tbody>
                            {outgoing.map((t) => (
                                <tr key={t.id}>
                                    <td>{formatDateTime(t.created_at)}</td>
                                    <td>{t.to_bank_name}</td>
                                    <td>{t.blood_type}</td>
                                    <td>{t.units}</td>
                                    <td><Badge value={t.urgency} /></td>
                                    <td><Badge value={t.status} /></td>
                                    <td className="muted">{t.rejection_reason || t.notes || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </TableWrap>
                )}
            </Card>
        </>
    );
}

// One chronological list of every stock movement for this bank.
function Transactions({ donations, requests, transfers, bankId }) {
    const rows = useMemo(() => {
        const list = [];
        for (const d of donations || []) {
            list.push({
                key: `d${d.id}`, at: d.created_at, type: 'Donation received', party: d.donor_name, blood_type: d.blood_type, change: +d.units,
                extra: [d.volume_ml != null && `${d.volume_ml} mL`, d.classification === 'low_volume' && 'red cells only', `expires ${formatDate(d.expiry_date)}`]
                    .filter(Boolean).join(' · '),
                classification: d.classification,
            });
        }
        for (const r of requests || []) {
            if (r.status === 'approved') list.push({ key: `r${r.id}`, at: r.updated_at, type: 'Issued to recipient', party: r.recipient_name, blood_type: r.blood_type, change: -r.units });
        }
        for (const t of transfers || []) {
            if (t.status !== 'approved') continue;
            const outgoing = t.to_bank_id === bankId;
            list.push({
                key: `t${t.id}`, at: t.updated_at,
                type: outgoing ? 'Transferred to bank' : 'Received from bank',
                party: outgoing ? t.from_bank_name : t.to_bank_name,
                blood_type: t.blood_type, change: outgoing ? -t.units : +t.units,
            });
        }
        return list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    }, [donations, requests, transfers, bankId]);

    return (
        <Card title="Transaction history">
            {!rows.length && <Empty>No stock movements yet.</Empty>}
            {rows.length > 0 && (
                <TableWrap>
                    <thead><tr><th>When</th><th>Type</th><th>Party</th><th>Group</th><th>Units</th><th /></tr></thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.key}>
                                <td>{formatDateTime(r.at)}</td>
                                <td>{r.type}{r.classification === 'low_volume' && <Badge value="low_volume">low volume</Badge>}</td>
                                <td>{r.party}</td>
                                <td>{r.blood_type}</td>
                                <td className={r.change > 0 ? 'plus' : 'minus'}>{r.change > 0 ? `+${r.change}` : r.change}</td>
                                <td className="muted small">{r.extra || ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
        </Card>
    );
}
