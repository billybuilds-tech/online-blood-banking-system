import { useCallback, useState } from 'react';
import { api } from '../../api.js';
import StockGrid from '../../components/StockGrid.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, Stat, TableWrap } from '../../components/ui.jsx';
import { ROLE_LABELS, VOLUME, addMonths, formatDate, formatDateTime } from '../../constants.js';
import { useAction, useApi, useLiveRefresh } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';
import { useSection, useSectionCounts } from '../../nav.jsx';
import { downloadMonthlyReport } from '../../utils/report.js';
import AuditLog from './AuditLog.jsx';
import ManagerStock from './ManagerStock.jsx';
import Statistics from './Statistics.jsx';

export default function ManagerDashboard() {
    const { t } = useI18n();
    const [tab, goTo] = useSection();
    const summary = useApi('/reports/summary');
    const pendingBanks = useApi('/users?role=bloodbank&status=pending');
    const { reload: reloadSummary } = summary;
    const { reload: reloadPending } = pendingBanks;
    const reloadAll = useCallback(() => { reloadSummary(); reloadPending(); }, [reloadSummary, reloadPending]);
    useLiveRefresh(reloadAll);
    useSectionCounts({ approvals: pendingBanks.data?.length ?? 0 });

    return (
        <div className="page">
            <div className="page-head">
                <h1>{t('Blood Bank Manager')}</h1>
                <p className="muted">{t('System administration, approvals, monitoring and reports')}</p>
            </div>


            {tab === 'overview' && <Overview summary={summary} pendingBanks={pendingBanks.data?.length ?? 0} goTo={goTo} />}
            {tab === 'statistics' && <Statistics />}
            {tab === 'stock' && <ManagerStock />}
            {tab === 'approvals' && <Approvals state={pendingBanks} onChange={reloadAll} />}
            {tab === 'users' && <Users onChange={reloadAll} />}
            {tab === 'activity' && <Activity />}
            {tab === 'reports' && <Reports />}
            {tab === 'notify' && <><SendNotification /><EmailGateway /></>}
        </div>
    );
}

const countUsers = (users, role, status = 'approved') =>
    (users || []).filter((u) => u.role === role && (!status || u.status === status)).reduce((s, u) => s + u.total, 0);

function Overview({ summary, pendingBanks, goTo }) {
    const { t } = useI18n();
    const s = summary.data;
    if (!s) return summary.error ? <Alert message={{ type: 'error', text: summary.error }} /> : <Loading />;
    const totalUnits = s.stock.reduce((sum, r) => sum + r.units, 0);
    const pendingRequests = s.requests.pending?.total ?? 0;
    return (
        <>
            <div className="stats">
                <Stat label={t('Donors')} value={countUsers(s.users, 'donor')} />
                <Stat label={t('Recipients')} value={countUsers(s.users, 'recipient')} />
                <Stat label={t('Approved blood banks')} value={countUsers(s.users, 'bloodbank')}
                    hint={pendingBanks ? t('{count} waiting for approval', { count: pendingBanks }) : undefined} tone={pendingBanks ? 'warn' : undefined} />
                <Stat label={t('Units in all banks')} value={totalUnits} />
                <Stat label={t('Donations this month')} value={s.donations.total} />
                <Stat label={t('Requests pending')} value={pendingRequests} tone={pendingRequests ? 'warn' : undefined} />
            </div>
            {pendingBanks > 0 && (
                <div className="alert alert-info">
                    {t('{count} blood bank(s) are waiting for approval.', { count: pendingBanks })}{' '}
                    <button type="button" className="link" onClick={() => goTo('approvals')}>{t('Review now')}</button>
                </div>
            )}
            <div className="two-col">
                <Card title={t('Total stock by blood group')}>
                    <StockGrid rows={s.stock} />
                </Card>
                <Card title={t('Low stock (below {count} units)', { count: s.lowStockThreshold })}>
                    {!s.lowStock.length && <Empty>{t('No bank is low on any blood group.')}</Empty>}
                    {s.lowStock.length > 0 && (
                        <TableWrap>
                            <thead><tr><th>{t('Blood bank')}</th><th>{t('Group')}</th><th>{t('Units')}</th></tr></thead>
                            <tbody>{s.lowStock.map((l, i) => <tr key={i}><td>{l.bank_name}</td><td>{l.blood_type}</td><td>{l.units}</td></tr>)}</tbody>
                        </TableWrap>
                    )}
                </Card>
            </div>
            <Card title={t('Stock by blood bank')}>
                <TableWrap>
                    <thead><tr><th>{t('Blood bank')}</th><th>{t('Region')}</th><th>{t('Total units')}</th></tr></thead>
                    <tbody>{s.banks.map((b) => <tr key={b.id}><td>{b.name}</td><td>{b.region}</td><td>{b.total_units}</td></tr>)}</tbody>
                </TableWrap>
            </Card>
        </>
    );
}

function Approvals({ state, onChange }) {
    const { t } = useI18n();
    const action = useAction();

    async function decide(bank, status) {
        const ok = await action.run(() => api(`/users/${bank.id}/status`, { method: 'PATCH', body: { status } }));
        if (ok) onChange();
    }

    return (
        <Card title={t('Blood banks waiting for approval')}>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            {state.loading && !state.data && <Loading />}
            {state.data && !state.data.length && <Empty>{t('No blood bank is waiting for approval.')}</Empty>}
            {state.data?.length > 0 && (
                <TableWrap>
                    <thead>
                        <tr><th>{t('Blood bank')}</th><th>{t('Contact')}</th><th>{t('Region')}</th><th>{t('Licence')}</th><th>{t('Registered')}</th><th>{t('Decision')}</th></tr>
                    </thead>
                    <tbody>
                        {state.data.map((b) => (
                            <tr key={b.id}>
                                <td><strong>{b.name}</strong><div className="muted small">{b.address}</div></td>
                                <td>{b.email}<div className="muted small">{b.phone}</div></td>
                                <td>{b.region}</td>
                                <td>{b.profile?.license_number || '-'}</td>
                                <td>{formatDate(b.created_at)}</td>
                                <td className="actions">
                                    <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => decide(b, 'approved')}>{t('Approve')}</button>
                                    <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => decide(b, 'rejected')}>{t('Reject')}</button>
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
    const { t } = useI18n();
    const [filters, setFilters] = useState({ role: '', status: '', search: '' });
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const users = useApi(`/users${query ? `?${query}` : ''}`);
    const action = useAction();
    const [confirmDelete, setConfirmDelete] = useState(null);

    async function setStatus(u, status) {
        const ok = await action.run(() => api(`/users/${u.id}/status`, { method: 'PATCH', body: { status } }));
        if (ok) { users.reload(); onChange(); }
    }

    async function remove(u) {
        const ok = await action.run(() => api(`/users/${u.id}`, { method: 'DELETE' }), t('{name} deleted', { name: u.name }));
        setConfirmDelete(null);
        if (ok) { users.reload(); onChange(); }
    }

    return (
        <Card title={t('User management')} actions={
            <div className="filters">
                <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })} aria-label={t('Role')}>
                    <option value="">{t('All roles')}</option>
                    {Object.entries(ROLE_LABELS).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
                </select>
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label={t('Status')}>
                    <option value="">{t('All statuses')}</option>
                    {['pending', 'approved', 'rejected', 'suspended'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
                </select>
                <input className="search" type="search" placeholder={t('Search')} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
            </div>
        }>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            {users.loading && !users.data && <Loading />}
            {users.data && !users.data.length && <Empty>{t('No users match these filters.')}</Empty>}
            {users.data?.length > 0 && (
                <TableWrap>
                    <thead>
                        <tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Group')}</th><th>{t('Region')}</th><th>{t('Status')}</th><th>{t('Joined')}</th><th>{t('Actions')}</th></tr>
                    </thead>
                    <tbody>
                        {users.data.map((u) => (
                            <tr key={u.id}>
                                <td>{u.name}<div className="muted small">{u.email}</div></td>
                                <td>{t(ROLE_LABELS[u.role])}</td>
                                <td>{u.blood_type || '-'}</td>
                                <td>{u.region || '-'}</td>
                                <td><Badge value={u.status} /></td>
                                <td>{formatDate(u.created_at)}</td>
                                <td className="actions">
                                    {u.role !== 'admin' && <>
                                        {u.status !== 'approved' && <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => setStatus(u, 'approved')}>{t('Approve')}</button>}
                                        {u.status === 'approved' && <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => setStatus(u, 'suspended')}>{t('Suspend')}</button>}
                                        {confirmDelete === u.id ? (
                                            <>
                                                <button type="button" className="btn btn-sm btn-danger" disabled={action.busy} onClick={() => remove(u)}>{t('Confirm delete')}</button>
                                                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(null)}>{t('Cancel')}</button>
                                            </>
                                        ) : (
                                            <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => setConfirmDelete(u.id)}>{t('Delete')}</button>
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

function Activity() {
    const { t } = useI18n();
    const [view, setView] = useState('audit');
    const appointments = useApi(view === 'appointments' ? '/appointments' : null);
    const requests = useApi(view === 'requests' ? '/blood-requests' : null);
    const transfers = useApi(view === 'transfers' ? '/inter-bank-requests' : null);

    return (
        <Card title={t('System activity')} actions={
            <select value={view} onChange={(e) => setView(e.target.value)} aria-label={t('View')}>
                <option value="audit">{t('Audit log')}</option>
                <option value="appointments">{t('All donation appointments')}</option>
                <option value="requests">{t('All blood requests')}</option>
                <option value="transfers">{t('All inter-bank transfers')}</option>
            </select>
        }>
            {view === 'audit' && <AuditLog />}
            {view === 'appointments' && (
                <TableWrap>
                    <thead><tr><th>{t('Date')}</th><th>{t('Donor')}</th><th>{t('Blood bank')}</th><th>{t('Group')}</th><th>{t('Status')}</th></tr></thead>
                    <tbody>
                        {(appointments.data || []).map((a) => (
                            <tr key={a.id}>
                                <td>{formatDate(a.appointment_date)}</td><td>{a.donor_name}</td><td>{a.bank_name}</td>
                                <td>{a.blood_type}</td><td><Badge value={a.status} /></td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
            {view === 'requests' && (
                <TableWrap>
                    <thead>
                        <tr><th>{t('Sent')}</th><th>{t('Recipient')}</th><th>{t('Blood bank')}</th><th>{t('Group')}</th><th>{t('Units')}</th><th>{t('Urgency')}</th><th>{t('Status')}</th></tr>
                    </thead>
                    <tbody>
                        {(requests.data || []).map((r) => (
                            <tr key={r.id}>
                                <td>{formatDateTime(r.created_at)}</td><td>{r.recipient_name}</td><td>{r.bank_name}</td><td>{r.blood_type}</td>
                                <td>{r.units}</td><td><Badge value={r.urgency} /></td><td><Badge value={r.status} /></td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
            {view === 'transfers' && (
                <TableWrap>
                    <thead>
                        <tr><th>{t('Sent')}</th><th>{t('Requesting bank')}</th><th>{t('Supplying bank')}</th><th>{t('Group')}</th><th>{t('Units')}</th><th>{t('Status')}</th></tr>
                    </thead>
                    <tbody>
                        {(transfers.data || []).map((tr) => (
                            <tr key={tr.id}>
                                <td>{formatDateTime(tr.created_at)}</td><td>{tr.from_bank_name}</td><td>{tr.to_bank_name}</td>
                                <td>{tr.blood_type}</td><td>{tr.units}</td><td><Badge value={tr.status} /></td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
        </Card>
    );
}

function Reports() {
    const { t } = useI18n();
    const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA').slice(0, 7));
    const summary = useApi(`/reports/summary?month=${month}`);
    // The PDF's charts show the 12 months up to the report's month.
    const trends = useApi(month ? `/reports/trends?from=${addMonths(month, -11)}&to=${month}` : null);
    const s = summary.data;
    const total = (group) => Object.values(group || {}).reduce((sum, v) => sum + v.total, 0);

    return (
        <Card title={t('Monthly report')} actions={
            <div className="filters">
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('Month')} />
                <button type="button" className="btn btn-primary btn-sm" disabled={!s || (!trends.data && !trends.error)}
                    onClick={() => downloadMonthlyReport(s, trends.data)}>{t('Download PDF')}</button>
            </div>
        }>
            {!s && <Loading />}
            {s && (
                <>
                    <p className="muted small">{t('The PDF has the figures of the month and a page of charts for the 12 months up to it.')}</p>
                    <div className="stats">
                        <Stat label={t('Verified donations')} value={s.donations.total} hint={t('{units} unit(s)', { units: s.donations.units })} />
                        <Stat label={t('Appointments')} value={total(s.appointments)} />
                        <Stat label={t('Blood requests')} value={total(s.requests)} hint={t('{units} unit(s) issued', { units: s.requests.approved?.units ?? 0 })} />
                        <Stat label={t('Inter-bank transfers')} value={total(s.transfers)} hint={t('{units} unit(s) moved', { units: s.transfers.approved?.units ?? 0 })} />
                    </div>
                    <div className="stats">
                        <Stat label={t('Standard units')} value={s.collections.standard} hint={`${VOLUME.STANDARD_MIN}–${VOLUME.STANDARD_MAX} mL`} tone="good" />
                        <Stat label={t('Low-volume units')} value={s.collections.low_volume}
                            hint={`${VOLUME.LOW_MIN}–${VOLUME.STANDARD_MIN - 1} mL · ${t('red cells only')}`} tone={s.collections.low_volume ? 'warn' : undefined} />
                        <Stat label={t('Incomplete collections')} value={s.collections.incomplete}
                            hint={t('Below {min} mL · not in stock', { min: VOLUME.LOW_MIN })} tone={s.collections.incomplete ? 'bad' : undefined} />
                        <Stat label={t('Deferred at health check')} value={s.deferrals.total}
                            hint={t('{count} permanent', { count: s.deferrals.permanent })} tone={s.deferrals.total ? 'warn' : undefined} />
                    </div>
                    <TableWrap>
                        <thead><tr><th>{t('Request status')}</th><th>{t('Count')}</th><th>{t('Units')}</th></tr></thead>
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
    const { t } = useI18n();
    const action = useAction();
    const users = useApi('/users?status=approved');
    const email = useApi('/notifications/email');
    const [form, setForm] = useState({ target: 'role', role: 'donor', userIds: [], title: '', message: '', method: 'email' });
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function submit(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/notifications', { method: 'POST', body: { ...form, userIds: form.userIds.map(Number) } }));
        if (ok) setForm({ ...form, title: '', message: '' });
    }

    return (
        <Card title={t('Send a notification')}>
            <form className="stack narrow" onSubmit={submit}>
                <Alert message={action.message} onClose={() => action.setMessage(null)} />
                <Field label={t('Send to')}>
                    <select value={form.target} onChange={set('target')}>
                        <option value="role">{t('A whole group')}</option>
                        <option value="users">{t('Selected users')}</option>
                        <option value="all">{t('Everyone')}</option>
                    </select>
                </Field>
                {form.target === 'role' && (
                    <Field label={t('Group')}>
                        <select value={form.role} onChange={set('role')}>
                            <option value="donor">{t('All donors')}</option>
                            <option value="recipient">{t('All recipients')}</option>
                            <option value="bloodbank">{t('All blood banks')}</option>
                        </select>
                    </Field>
                )}
                {form.target === 'users' && (
                    <Field label={t('Users')} hint={t('Hold Ctrl (or Cmd) to select more than one')}>
                        <select multiple size={8} value={form.userIds}
                            onChange={(e) => setForm({ ...form, userIds: [...e.target.selectedOptions].map((o) => o.value) })}>
                            {(users.data || []).filter((u) => u.role !== 'admin').map((u) => (
                                <option key={u.id} value={u.id}>{u.name} — {t(ROLE_LABELS[u.role])}</option>
                            ))}
                        </select>
                    </Field>
                )}
                <Field label={t('Title')}>
                    <input required maxLength={150} value={form.title} onChange={set('title')} placeholder={t('e.g. Urgent need for O- donors')} />
                </Field>
                <Field label={t('Message')}><textarea required rows={5} maxLength={2000} value={form.message} onChange={set('message')} /></Field>
                <Field label={t('Delivery method')} hint={form.method === 'sms'
                    ? t('SMS is recorded only; no SMS gateway is connected in this version.')
                    : form.method === 'email' && email.data && !email.data.configured
                        ? t('No email account is set yet, so the message is shown in the system only.')
                        : form.method === 'email'
                            ? t('Also emailed to receivers who keep email notifications on.')
                            : undefined}>
                    <select value={form.method} onChange={set('method')}>
                        <option value="email">{t('In the system and by email')}</option>
                        <option value="in_app">{t('In the system only')}</option>
                        <option value="sms">SMS</option>
                    </select>
                </Field>
                <p className="muted small">{t('Announcements are delivered exactly as you write them, so write in the language your readers use.')}</p>
                <button className="btn btn-primary" disabled={action.busy}>{action.busy ? t('Sending…') : t('Send notification')}</button>
            </form>
        </Card>
    );
}

// Whether notifications are emailed, how many were sent recently, and a test email to check the account.
function EmailGateway() {
    const { t } = useI18n();
    const status = useApi('/notifications/email');
    const action = useAction();
    const [to, setTo] = useState('');
    const s = status.data;

    async function sendTest(e) {
        e.preventDefault();
        await action.run(() => api('/notifications/email/test', { method: 'POST', body: { to } }));
    }

    return (
        <Card title={t('Email gateway')} actions={<button type="button" className="btn btn-ghost btn-sm" onClick={status.reload}>{t('Refresh')}</button>}>
            <Alert message={status.error ? { type: 'error', text: status.error } : null} />
            {!s && !status.error && <Loading />}
            {s && !s.configured && (
                <p className="note-box small">
                    {t('No email account is set, so notifications are shown in the system only. Fill in SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM in server/.env (see .env.example) and restart the API.')}
                </p>
            )}
            {s?.configured && (
                <>
                    <p className="muted small">{t('Notifications are emailed from {from}.', { from: s.from })}</p>
                    <div className="stats">
                        <Stat label={t('Emails sent (30 days)')} value={s.sent} tone="good" />
                        <Stat label={t('Waiting to be sent')} value={s.pending} tone={s.pending ? 'warn' : undefined} />
                        <Stat label={t('Failed')} value={s.failed} tone={s.failed ? 'bad' : undefined}
                            hint={s.failed ? t('Tried 5 times; see the API window for the reason') : undefined} />
                    </div>
                    <form className="stack narrow" onSubmit={sendTest}>
                        <Alert message={action.message} onClose={() => action.setMessage(null)} />
                        <Field label={t('Send a test email to')}>
                            <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@gmail.com" />
                        </Field>
                        <button className="btn btn-primary" disabled={action.busy}>{action.busy ? t('Sending…') : t('Send test email')}</button>
                    </form>
                </>
            )}
        </Card>
    );
}
