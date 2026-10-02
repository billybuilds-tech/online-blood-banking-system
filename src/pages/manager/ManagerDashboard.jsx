import { useState } from 'react';
import { api } from '../../api.js';
import StockGrid from '../../components/StockGrid.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, Stat, TableWrap, Tabs } from '../../components/ui.jsx';
import { ROLE_LABELS, formatDate, formatDateTime } from '../../constants.js';
import { useAction, useApi } from '../../hooks.js';
import { downloadMonthlyReport } from '../../utils/report.js';

export default function ManagerDashboard() {
    const [tab, setTab] = useState('overview');
    const summary = useApi('/reports/summary');
    const pendingBanks = useApi('/users?role=bloodbank&status=pending');

    return (
        <div className="page">
            <div className="page-head">
                <h1>Blood Bank Manager</h1>
                <p className="muted">System administration, approvals, monitoring and reports</p>
            </div>

            <Tabs active={tab} onChange={setTab} tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'approvals', label: 'Bank approvals', count: pendingBanks.data?.length },
                { id: 'users', label: 'Users' },
                { id: 'activity', label: 'Activity' },
                { id: 'reports', label: 'Reports' },
                { id: 'notify', label: 'Send notification' },
            ]} />

            {tab === 'overview' && <Overview summary={summary} pendingBanks={pendingBanks.data?.length ?? 0} goTo={setTab} />}
            {tab === 'approvals' && <Approvals state={pendingBanks} onChange={() => { pendingBanks.reload(); summary.reload(); }} />}
            {tab === 'users' && <Users onChange={() => { pendingBanks.reload(); summary.reload(); }} />}
            {tab === 'activity' && <Activity summary={summary} />}
            {tab === 'reports' && <Reports />}
            {tab === 'notify' && <SendNotification />}
        </div>
    );
}

const countUsers = (users, role, status = 'approved') =>
    (users || []).filter((u) => u.role === role && (!status || u.status === status)).reduce((s, u) => s + u.total, 0);

function Overview({ summary, pendingBanks, goTo }) {
    const s = summary.data;
    if (!s) return summary.error ? <Alert message={{ type: 'error', text: summary.error }} /> : <Loading />;
    const totalUnits = s.stock.reduce((sum, r) => sum + r.units, 0);
    const pendingRequests = s.requests.pending?.total ?? 0;
    return (
        <>
            <div className="stats">
                <Stat label="Donors" value={countUsers(s.users, 'donor')} />
                <Stat label="Recipients" value={countUsers(s.users, 'recipient')} />
                <Stat label="Approved blood banks" value={countUsers(s.users, 'bloodbank')} hint={pendingBanks ? `${pendingBanks} waiting for approval` : undefined} tone={pendingBanks ? 'warn' : undefined} />
                <Stat label="Units in all banks" value={totalUnits} />
                <Stat label="Donations this month" value={s.donations.total} />
                <Stat label="Requests pending" value={pendingRequests} tone={pendingRequests ? 'warn' : undefined} />
            </div>
            {pendingBanks > 0 && (
                <div className="alert alert-info">
                    {pendingBanks} blood bank(s) are waiting for approval. <button type="button" className="link" onClick={() => goTo('approvals')}>Review now</button>
                </div>
            )}
            <div className="two-col">
                <Card title="Total stock by blood group">
                    <StockGrid rows={s.stock} />
                </Card>
                <Card title={`Low stock (below ${s.lowStockThreshold} units)`}>
                    {!s.lowStock.length && <Empty>No bank is low on any blood group.</Empty>}
                    {s.lowStock.length > 0 && (
                        <TableWrap>
                            <thead><tr><th>Blood bank</th><th>Group</th><th>Units</th></tr></thead>
                            <tbody>{s.lowStock.map((l, i) => <tr key={i}><td>{l.bank_name}</td><td>{l.blood_type}</td><td>{l.units}</td></tr>)}</tbody>
                        </TableWrap>
                    )}
                </Card>
            </div>
            <Card title="Stock by blood bank">
                <TableWrap>
                    <thead><tr><th>Blood bank</th><th>Region</th><th>Total units</th></tr></thead>
                    <tbody>{s.banks.map((b) => <tr key={b.id}><td>{b.name}</td><td>{b.region}</td><td>{b.total_units}</td></tr>)}</tbody>
                </TableWrap>
            </Card>
        </>
    );
}

function Approvals({ state, onChange }) {
    const action = useAction();

    async function decide(bank, status) {
        const ok = await action.run(() => api(`/users/${bank.id}/status`, { method: 'PATCH', body: { status } }),
            `${bank.name} ${status}`);
        if (ok) onChange();
    }

    return (
        <Card title="Blood banks waiting for approval">
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            {state.loading && !state.data && <Loading />}
            {state.data && !state.data.length && <Empty>No blood bank is waiting for approval.</Empty>}
            {state.data?.length > 0 && (
                <TableWrap>
                    <thead><tr><th>Blood bank</th><th>Contact</th><th>Region</th><th>Licence</th><th>Registered</th><th>Decision</th></tr></thead>
                    <tbody>
                        {state.data.map((b) => (
                            <tr key={b.id}>
                                <td><strong>{b.name}</strong><div className="muted small">{b.address}</div></td>
                                <td>{b.email}<div className="muted small">{b.phone}</div></td>
                                <td>{b.region}</td>
                                <td>{b.profile?.license_number || '-'}</td>
                                <td>{formatDate(b.created_at)}</td>
                                <td className="actions">
                                    <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => decide(b, 'approved')}>Approve</button>
                                    <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => decide(b, 'rejected')}>Reject</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
        </Card>
    );
}

function Users({ onChange }) {
    const [filters, setFilters] = useState({ role: '', status: '', search: '' });
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const users = useApi(`/users${query ? `?${query}` : ''}`);
    const action = useAction();
    const [confirmDelete, setConfirmDelete] = useState(null);

    async function setStatus(u, status) {
        const ok = await action.run(() => api(`/users/${u.id}/status`, { method: 'PATCH', body: { status } }), `${u.name}: ${status}`);
        if (ok) { users.reload(); onChange(); }
    }

    async function remove(u) {
        const ok = await action.run(() => api(`/users/${u.id}`, { method: 'DELETE' }), `${u.name} deleted`);
        setConfirmDelete(null);
        if (ok) { users.reload(); onChange(); }
    }

    return (
        <Card title="User management" actions={
            <div className="filters">
                <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })} aria-label="Role">
                    <option value="">All roles</option>
                    {Object.entries(ROLE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Status">
                    <option value="">All statuses</option>
                    {['pending', 'approved', 'rejected', 'suspended'].map((s) => <option key={s}>{s}</option>)}
                </select>
                <input className="search" type="search" placeholder="Search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
            </div>
        }>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            {users.loading && !users.data && <Loading />}
            {users.data && !users.data.length && <Empty>No users match these filters.</Empty>}
            {users.data?.length > 0 && (
                <TableWrap>
                    <thead><tr><th>Name</th><th>Role</th><th>Group</th><th>Region</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                    <tbody>
                        {users.data.map((u) => (
                            <tr key={u.id}>
                                <td>{u.name}<div className="muted small">{u.email}</div></td>
                                <td>{ROLE_LABELS[u.role]}</td>
                                <td>{u.blood_type || '-'}</td>
                                <td>{u.region || '-'}</td>
                                <td><Badge value={u.status} /></td>
                                <td>{formatDate(u.created_at)}</td>
                                <td className="actions">
                                    {u.role !== 'admin' && <>
                                        {u.status !== 'approved' && <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => setStatus(u, 'approved')}>Approve</button>}
                                        {u.status === 'approved' && <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => setStatus(u, 'suspended')}>Suspend</button>}
                                        {confirmDelete === u.id ? (
                                            <>
                                                <button type="button" className="btn btn-sm btn-danger" disabled={action.busy} onClick={() => remove(u)}>Confirm delete</button>
                                                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                            </>
                                        ) : (
                                            <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => setConfirmDelete(u.id)}>Delete</button>
                                        )}
                                    </>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
        </Card>
    );
}

function Activity({ summary }) {
    const appointments = useApi('/appointments');
    const requests = useApi('/blood-requests');
    const transfers = useApi('/inter-bank-requests');
    const [view, setView] = useState('recent');

    return (
        <Card title="System activity" actions={
            <select value={view} onChange={(e) => setView(e.target.value)} aria-label="View">
                <option value="recent">Recent activity</option>
                <option value="appointments">All donation appointments</option>
                <option value="requests">All blood requests</option>
                <option value="transfers">All inter-bank transfers</option>
            </select>
        }>
            {view === 'recent' && (
                !summary.data ? <Loading /> : !summary.data.recentActivity.length ? <Empty>No activity yet.</Empty> : (
                    <TableWrap>
                        <thead><tr><th>When</th><th>Type</th><th>By</th><th>Blood bank</th><th>Group</th><th>Units</th><th>Status</th></tr></thead>
                        <tbody>
                            {summary.data.recentActivity.map((a, i) => (
                                <tr key={i}><td>{formatDateTime(a.at)}</td><td>{a.type}</td><td>{a.actor}</td><td>{a.bank}</td><td>{a.blood_type}</td><td>{a.units}</td><td><Badge value={a.status} /></td></tr>
                            ))}
                        </tbody>
                    </TableWrap>
                )
            )}
            {view === 'appointments' && (
                <TableWrap>
                    <thead><tr><th>Date</th><th>Donor</th><th>Blood bank</th><th>Group</th><th>Status</th></tr></thead>
                    <tbody>{(appointments.data || []).map((a) => <tr key={a.id}><td>{formatDate(a.appointment_date)}</td><td>{a.donor_name}</td><td>{a.bank_name}</td><td>{a.blood_type}</td><td><Badge value={a.status} /></td></tr>)}</tbody>
                </TableWrap>
            )}
            {view === 'requests' && (
                <TableWrap>
                    <thead><tr><th>Sent</th><th>Recipient</th><th>Blood bank</th><th>Group</th><th>Units</th><th>Urgency</th><th>Status</th></tr></thead>
                    <tbody>{(requests.data || []).map((r) => <tr key={r.id}><td>{formatDateTime(r.created_at)}</td><td>{r.recipient_name}</td><td>{r.bank_name}</td><td>{r.blood_type}</td><td>{r.units}</td><td><Badge value={r.urgency} /></td><td><Badge value={r.status} /></td></tr>)}</tbody>
                </TableWrap>
            )}
            {view === 'transfers' && (
                <TableWrap>
                    <thead><tr><th>Sent</th><th>Requesting bank</th><th>Supplying bank</th><th>Group</th><th>Units</th><th>Status</th></tr></thead>
                    <tbody>{(transfers.data || []).map((t) => <tr key={t.id}><td>{formatDateTime(t.created_at)}</td><td>{t.from_bank_name}</td><td>{t.to_bank_name}</td><td>{t.blood_type}</td><td>{t.units}</td><td><Badge value={t.status} /></td></tr>)}</tbody>
                </TableWrap>
            )}
        </Card>
    );
}

function Reports() {
    const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA').slice(0, 7));
    const summary = useApi(`/reports/summary?month=${month}`);
    const s = summary.data;
    const total = (group) => Object.values(group || {}).reduce((sum, v) => sum + v.total, 0);

    return (
        <Card title="Monthly report" actions={
            <div className="filters">
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
                <button type="button" className="btn btn-primary btn-sm" disabled={!s} onClick={() => downloadMonthlyReport(s)}>Download PDF</button>
            </div>
        }>
            {!s && <Loading />}
            {s && (
                <>
                    <div className="stats">
                        <Stat label="Verified donations" value={s.donations.total} hint={`${s.donations.units} unit(s)`} />
                        <Stat label="Appointments" value={total(s.appointments)} />
                        <Stat label="Blood requests" value={total(s.requests)} hint={`${s.requests.approved?.units ?? 0} unit(s) issued`} />
                        <Stat label="Inter-bank transfers" value={total(s.transfers)} hint={`${s.transfers.approved?.units ?? 0} unit(s) moved`} />
                    </div>
                    <div className="stats">
                        <Stat label="Standard units" value={s.collections.standard} hint="405–495 mL" tone="good" />
                        <Stat label="Low-volume units" value={s.collections.low_volume} hint="300–404 mL · red cells only" tone={s.collections.low_volume ? 'warn' : undefined} />
                        <Stat label="Incomplete collections" value={s.collections.incomplete} hint="Below 300 mL · not in stock" tone={s.collections.incomplete ? 'bad' : undefined} />
                    </div>
                    <TableWrap>
                        <thead><tr><th>Request status</th><th>Count</th><th>Units</th></tr></thead>
                        <tbody>
                            {['pending', 'approved', 'rejected'].map((st) => (
                                <tr key={st}><td><Badge value={st} /></td><td>{s.requests[st]?.total ?? 0}</td><td>{s.requests[st]?.units ?? 0}</td></tr>
                            ))}
                        </tbody>
                    </TableWrap>
                </>
            )}
        </Card>
    );
}

function SendNotification() {
    const action = useAction();
    const users = useApi('/users?status=approved');
    const [form, setForm] = useState({ target: 'role', role: 'donor', userIds: [], title: '', message: '', method: 'in_app' });
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function submit(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/notifications', { method: 'POST', body: { ...form, userIds: form.userIds.map(Number) } }));
        if (ok) setForm({ ...form, title: '', message: '' });
    }

    return (
        <Card title="Send a notification">
            <form className="stack narrow" onSubmit={submit}>
                <Alert message={action.message} onClose={() => action.setMessage(null)} />
                <Field label="Send to">
                    <select value={form.target} onChange={set('target')}>
                        <option value="role">A whole group</option>
                        <option value="users">Selected users</option>
                        <option value="all">Everyone</option>
                    </select>
                </Field>
                {form.target === 'role' && (
                    <Field label="Group">
                        <select value={form.role} onChange={set('role')}>
                            <option value="donor">All donors</option>
                            <option value="recipient">All recipients</option>
                            <option value="bloodbank">All blood banks</option>
                        </select>
                    </Field>
                )}
                {form.target === 'users' && (
                    <Field label="Users" hint="Hold Ctrl (or Cmd) to select more than one">
                        <select multiple size={8} value={form.userIds}
                            onChange={(e) => setForm({ ...form, userIds: [...e.target.selectedOptions].map((o) => o.value) })}>
                            {(users.data || []).filter((u) => u.role !== 'admin').map((u) => (
                                <option key={u.id} value={u.id}>{u.name} — {ROLE_LABELS[u.role]}</option>
                            ))}
                        </select>
                    </Field>
                )}
                <Field label="Title"><input required maxLength={150} value={form.title} onChange={set('title')} placeholder="e.g. Urgent need for O- donors" /></Field>
                <Field label="Message"><textarea required rows={5} maxLength={2000} value={form.message} onChange={set('message')} /></Field>
                <Field label="Delivery method" hint="Email and SMS are recorded; no mail or SMS gateway is connected in this version.">
                    <select value={form.method} onChange={set('method')}>
                        <option value="in_app">In-app</option>
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                    </select>
                </Field>
                <button className="btn btn-primary" disabled={action.busy}>{action.busy ? 'Sending…' : 'Send notification'}</button>
            </form>
        </Card>
    );
}
