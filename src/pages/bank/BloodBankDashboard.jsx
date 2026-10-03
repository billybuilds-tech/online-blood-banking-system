import { Fragment, useCallback, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import StockGrid from '../../components/StockGrid.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, Stat, TableWrap, Tabs } from '../../components/ui.jsx';
import {
    BLOOD_TYPES, DISCARD_REASON_LABELS, EXPIRY_WARNING_DAYS, LOW_STOCK, VOLUME, appointmentNote, formatDate, formatDateTime,
} from '../../constants.js';
import { useAction, useApi, useLiveRefresh } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';
import AppealsPanel from './AppealsPanel.jsx';
import DonationDayForm from './DonationDayForm.jsx';
import StockPanel from './StockPanel.jsx';

export default function BloodBankDashboard() {
    const { user } = useAuth();
    const { t } = useI18n();
    const [tab, setTab] = useState('overview');
    const stock = useApi(`/stock?bankId=${user.id}`);
    const appointments = useApi('/appointments');
    const requests = useApi('/blood-requests');
    const transfers = useApi('/inter-bank-requests');
    const donations = useApi('/donations');
    const appeals = useApi('/appeals');
    const removed = useApi('/stock/units?status=expired,discarded');

    const { reload: reloadStock } = stock;
    const { reload: reloadAppointments } = appointments;
    const { reload: reloadRequests } = requests;
    const { reload: reloadTransfers } = transfers;
    const { reload: reloadDonations } = donations;
    const { reload: reloadAppeals } = appeals;
    const { reload: reloadRemoved } = removed;
    const reloadAll = useCallback(() => {
        reloadStock(); reloadAppointments(); reloadRequests(); reloadTransfers(); reloadDonations(); reloadAppeals(); reloadRemoved();
    }, [reloadStock, reloadAppointments, reloadRequests, reloadTransfers, reloadDonations, reloadAppeals, reloadRemoved]);
    useLiveRefresh(reloadAll);

    const pendingAppointments = appointments.data?.filter((a) => a.status === 'pending' || a.status === 'approved').length ?? 0;
    const pendingRequests = requests.data?.filter((r) => r.status === 'pending').length ?? 0;
    const incomingTransfers = transfers.data?.filter((tr) => tr.status === 'pending' && tr.to_bank_id === user.id).length ?? 0;
    const activeAppeals = appeals.data?.filter((a) => a.is_active).length ?? 0;

    return (
        <div className="page">
            <div className="page-head">
                <h1>{user.name}</h1>
                <p className="muted">{t('Blood Bank Module')} · {user.region}</p>
            </div>

            <Tabs active={tab} onChange={setTab} tabs={[
                { id: 'overview', label: t('Overview') },
                { id: 'stock', label: t('Stock') },
                { id: 'appointments', label: t('Donations'), count: pendingAppointments },
                { id: 'requests', label: t('Blood requests'), count: pendingRequests },
                { id: 'transfers', label: t('Inter-bank'), count: incomingTransfers },
                { id: 'appeals', label: t('Donor appeals'), count: activeAppeals },
                { id: 'transactions', label: t('Transactions') },
            ]} />

            {tab === 'overview' && (
                <Overview stock={stock.data} pendingAppointments={pendingAppointments} pendingRequests={pendingRequests}
                    incomingTransfers={incomingTransfers} donations={donations.data} requests={requests.data} goTo={setTab} />
            )}
            {tab === 'stock' && <StockPanel stock={stock} onChange={reloadAll} />}
            {tab === 'appointments' && <AppointmentsPanel state={appointments} onChange={reloadAll} />}
            {tab === 'requests' && <RequestsPanel state={requests} onChange={reloadAll} />}
            {tab === 'transfers' && <TransfersPanel state={transfers} stock={stock.data} onChange={reloadAll} />}
            {tab === 'appeals' && <AppealsPanel state={appeals} stock={stock.data} region={user.region} onChange={reloadAll} />}
            {tab === 'transactions' && (
                <Transactions donations={donations.data} requests={requests.data} transfers={transfers.data} removed={removed.data} bankId={user.id} />
            )}
        </div>
    );
}

function Overview({ stock, pendingAppointments, pendingRequests, incomingTransfers, donations, requests, goTo }) {
    const { t } = useI18n();
    const total = stock?.reduce((s, r) => s + r.units, 0) ?? 0;
    const low = stock?.filter((r) => r.units < LOW_STOCK) ?? [];
    const expiring = stock?.filter((r) => r.expiring > 0) ?? [];
    const expiringBags = expiring.reduce((s, r) => s + r.expiring, 0);
    const urgent = requests?.filter((r) => r.status === 'pending' && r.urgency !== 'normal') ?? [];
    return (
        <>
            <div className="stats">
                <Stat label={t('Units in stock')} value={stock ? total : '–'} />
                <Stat label={t('Low-stock groups')} value={stock ? low.length : '–'} tone={low.length ? 'warn' : 'good'} hint={low.map((l) => l.blood_type).join(', ')} />
                <Stat label={t('Expiring within {days} days', { days: EXPIRY_WARNING_DAYS })} value={stock ? expiringBags : '–'}
                    tone={expiringBags ? 'warn' : 'good'} hint={expiring.map((r) => `${r.blood_type} (${r.expiring})`).join(', ')} />
                <Stat label={t('Pending requests')} value={pendingRequests} tone={urgent.length ? 'bad' : undefined}
                    hint={urgent.length ? t('{count} urgent', { count: urgent.length }) : undefined} />
                <Stat label={t('Donations verified')} value={donations?.length ?? '–'} />
            </div>
            <Card title={t('Current stock')}>
                {stock ? <StockGrid rows={stock} /> : <Loading />}
            </Card>
            <Card title={t('Needs your attention')}>
                <ul className="todo">
                    <li><button type="button" className="link" onClick={() => goTo('requests')}>{t('{count} blood request(s) waiting', { count: pendingRequests })}</button></li>
                    <li><button type="button" className="link" onClick={() => goTo('appointments')}>{t('{count} donation appointment(s) open', { count: pendingAppointments })}</button></li>
                    <li><button type="button" className="link" onClick={() => goTo('transfers')}>{t('{count} inter-bank request(s) from other banks', { count: incomingTransfers })}</button></li>
                    {expiringBags > 0 && (
                        <li><button type="button" className="link" onClick={() => goTo('stock')}>
                            {t('{count} bag(s) expire within {days} days: issue them first or offer them to another bank', { count: expiringBags, days: EXPIRY_WARNING_DAYS })}
                        </button></li>
                    )}
                    {low.length > 0 && (
                        <li><button type="button" className="link" onClick={() => goTo('appeals')}>
                            {t('Low stock of {groups}: send an urgent appeal to donors', { groups: low.map((l) => l.blood_type).join(', ') })}
                        </button></li>
                    )}
                </ul>
            </Card>
        </>
    );
}

function AppointmentsPanel({ state, onChange }) {
    const { t } = useI18n();
    const action = useAction();
    const [filter, setFilter] = useState('open');
    const [verifying, setVerifying] = useState(null);

    async function update(a, status, extra = {}) {
        let rejection_reason;
        if (status === 'rejected') {
            rejection_reason = window.prompt(t('Reason for rejecting (optional):')) ?? '';
        }
        const ok = await action.run(() => api(`/appointments/${a.id}/status`, { method: 'PATCH', body: { status, rejection_reason, ...extra } }));
        if (ok) { setVerifying(null); onChange(); }
    }

    const rows = (state.data || []).filter((a) => filter === 'all' || a.status === 'pending' || a.status === 'approved');

    return (
        <Card title={t('Donation appointments')} actions={
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('Filter')}>
                <option value="open">{t('Open')}</option>
                <option value="all">{t('All')}</option>
            </select>
        }>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            {state.loading && !state.data && <Loading />}
            {state.data && !rows.length && <Empty>{t('No appointments to show.')}</Empty>}
            {rows.length > 0 && (
                <TableWrap>
                    <thead><tr><th>{t('Date')}</th><th>{t('Donor')}</th><th>{t('Group')}</th><th>{t('Phone')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead>
                    <tbody>
                        {rows.map((a) => (
                            <Fragment key={a.id}>
                                <tr className={verifying === a.id ? 'row-open' : ''}>
                                    <td>{formatDate(a.appointment_date)}</td>
                                    <td>{a.donor_name}{a.notes && <div className="muted small">{a.notes}</div>}</td>
                                    <td>
                                        {a.blood_type}
                                        {(a.status === 'pending' || a.status === 'approved') && (
                                            <div className="muted small">{a.donor_group_confirmed_at ? t('confirmed') : t('not yet confirmed')}</div>
                                        )}
                                    </td>
                                    <td>{a.donor_phone || '-'}</td>
                                    <td><Badge value={a.status} /></td>
                                    <td className="actions">
                                        {a.status === 'pending' && <>
                                            <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => update(a, 'approved')}>{t('Approve')}</button>
                                            <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => update(a, 'rejected')}>{t('Reject')}</button>
                                        </>}
                                        {a.status === 'approved' && verifying !== a.id && <>
                                            <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => setVerifying(a.id)}>{t('Start donation-day check')}</button>
                                            <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => update(a, 'rejected')}>{t('Did not attend')}</button>
                                        </>}
                                        {a.status === 'completed' && a.collected_volume_ml != null && (
                                            <span className="muted small">{a.collected_volume_ml} mL</span>
                                        )}
                                        {(a.status === 'deferred' || (a.status === 'rejected' && (a.collected_volume_ml != null || a.rejection_reason))) && (
                                            <span className="muted small">{appointmentNote(a, t)}</span>
                                        )}
                                    </td>
                                </tr>
                                {a.status === 'approved' && verifying === a.id && (
                                    <tr className="dday-row">
                                        <td colSpan={6}>
                                            <DonationDayForm appointment={a} busy={action.busy} onCancel={() => setVerifying(null)}
                                                onComplete={(data) => update(a, 'completed', data)}
                                                onDefer={(data) => update(a, 'deferred', data)} />
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                    </tbody>
                </TableWrap>
            )}
            <p className="muted small">
                {t('On the donation day, record the health check first; blood is collected only if every check passes, otherwise defer the donor. Then enter the measured volume: {stdMin}–{stdMax} mL is a standard unit; {lowMin}–{lowMax} mL is a low-volume unit for red cells only; below {lowMin} mL is an incomplete collection and is not added to stock.', {
                    stdMin: VOLUME.STANDARD_MIN, stdMax: VOLUME.STANDARD_MAX, lowMin: VOLUME.LOW_MIN, lowMax: VOLUME.STANDARD_MIN - 1,
                })}
            </p>
        </Card>
    );
}

function RequestsPanel({ state, onChange }) {
    const { t } = useI18n();
    const action = useAction();
    const [filter, setFilter] = useState('pending');

    async function update(r, status) {
        let rejection_reason;
        if (status === 'rejected') rejection_reason = window.prompt(t('Reason for rejecting (optional):')) ?? '';
        const ok = await action.run(() => api(`/blood-requests/${r.id}/status`, { method: 'PATCH', body: { status, rejection_reason } }));
        if (ok) onChange();
    }

    const rows = (state.data || []).filter((r) => filter === 'all' || r.status === filter);

    return (
        <Card title={t('Incoming blood requests')} actions={
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('Filter')}>
                <option value="pending">{t('Pending')}</option>
                <option value="approved">{t('Approved')}</option>
                <option value="rejected">{t('Rejected')}</option>
                <option value="all">{t('All')}</option>
            </select>
        }>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            <p className="muted small">{t('Pending requests are listed by urgency; within the same urgency, requests from blood donors come first, then the oldest.')}</p>
            {state.loading && !state.data && <Loading />}
            {state.data && !rows.length && <Empty>{t('No requests to show.')}</Empty>}
            {rows.length > 0 && (
                <TableWrap>
                    <thead>
                        <tr><th>{t('Received')}</th><th>{t('Recipient')}</th><th>{t('Group')}</th><th>{t('Units')}</th><th>{t('Urgency')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id} className={r.status === 'pending' && r.urgency !== 'normal' ? 'row-urgent' : ''}>
                                <td>{formatDateTime(r.created_at)}</td>
                                <td>
                                    {r.recipient_name}
                                    {r.requester_donations > 0 && (
                                        <Badge value="donor">{t('Donor · {count} donation(s)', { count: r.requester_donations })}</Badge>
                                    )}
                                    <div className="muted small">{[r.recipient_phone, r.reason].filter(Boolean).join(' · ')}</div>
                                </td>
                                <td>{r.blood_type}</td>
                                <td>{r.units}</td>
                                <td><Badge value={r.urgency} /></td>
                                <td><Badge value={r.status} /></td>
                                <td className="actions">
                                    {r.status === 'pending' ? <>
                                        <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => update(r, 'approved')}>{t('Approve')}</button>
                                        <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => update(r, 'rejected')}>{t('Reject')}</button>
                                    </> : <span className="muted small">{r.unit_numbers?.length ? t('Bags: {list}', { list: r.unit_numbers.join(', ') }) : r.rejection_reason || ''}</span>}
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
    const { t } = useI18n();
    const banks = useApi('/users?role=bloodbank');
    const action = useAction();
    const [form, setForm] = useState({ to_bank_id: '', blood_type: 'O+', units: 1, urgency: 'normal', notes: '' });
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    const incoming = (state.data || []).filter((tr) => tr.to_bank_id === user.id);
    const outgoing = (state.data || []).filter((tr) => tr.from_bank_id === user.id);
    const myUnits = Object.fromEntries((stock || []).map((s) => [s.blood_type, s.units]));

    async function send(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/inter-bank-requests', { method: 'POST', body: { ...form, units: Number(form.units) } }));
        if (ok) { setForm({ ...form, units: 1, notes: '' }); onChange(); }
    }

    async function respond(tr, status) {
        let rejection_reason;
        if (status === 'rejected') rejection_reason = window.prompt(t('Reason for declining (optional):')) ?? '';
        const ok = await action.run(() => api(`/inter-bank-requests/${tr.id}/status`, { method: 'PATCH', body: { status, rejection_reason } }));
        if (ok) onChange();
    }

    return (
        <>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            <div className="two-col">
                <Card title={t('Ask another bank for blood')}>
                    <form className="stack" onSubmit={send}>
                        <Field label={t('Supplying blood bank')}>
                            <select required value={form.to_bank_id} onChange={set('to_bank_id')}>
                                <option value="">{t('Select a blood bank')}</option>
                                {banks.data?.filter((b) => b.id !== user.id).map((b) => <option key={b.id} value={b.id}>{b.name}{b.region ? ` — ${b.region}` : ''}</option>)}
                            </select>
                        </Field>
                        <div className="form-grid">
                            <Field label={t('Blood group')}>
                                <select value={form.blood_type} onChange={set('blood_type')}>
                                    {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                                </select>
                            </Field>
                            <Field label={t('Units')}>
                                <input type="number" min={1} max={200} required value={form.units} onChange={set('units')} />
                            </Field>
                        </div>
                        <Field label={t('Urgency')}>
                            <select value={form.urgency} onChange={set('urgency')}>
                                <option value="normal">{t('Normal')}</option>
                                <option value="urgent">{t('Urgent')}</option>
                                <option value="critical">{t('Critical')}</option>
                            </select>
                        </Field>
                        <Field label={t('Notes (optional)')}><input value={form.notes} onChange={set('notes')} maxLength={255} /></Field>
                        <button className="btn btn-primary" disabled={action.busy}>{t('Send request')}</button>
                    </form>
                </Card>

                <Card title={t('Requests from other banks')}>
                    {!incoming.length && <Empty>{t('No requests from other banks.')}</Empty>}
                    {incoming.length > 0 && (
                        <TableWrap>
                            <thead><tr><th>{t('From')}</th><th>{t('Group')}</th><th>{t('Units')}</th><th>{t('You hold')}</th><th>{t('Status')}</th><th /></tr></thead>
                            <tbody>
                                {incoming.map((tr) => (
                                    <tr key={tr.id} className={tr.status === 'pending' && tr.urgency !== 'normal' ? 'row-urgent' : ''}>
                                        <td>{tr.from_bank_name}<div className="muted small">{formatDateTime(tr.created_at)} · <Badge value={tr.urgency} /></div></td>
                                        <td>{tr.blood_type}</td>
                                        <td>{tr.units}</td>
                                        <td>{myUnits[tr.blood_type] ?? 0}</td>
                                        <td><Badge value={tr.status} /></td>
                                        <td className="actions">
                                            {tr.status === 'pending' && <>
                                                <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => respond(tr, 'approved')}>{t('Supply')}</button>
                                                <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => respond(tr, 'rejected')}>{t('Decline')}</button>
                                            </>}
                                            {tr.unit_numbers?.length > 0 && <span className="muted small">{t('Bags: {list}', { list: tr.unit_numbers.join(', ') })}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    )}
                </Card>
            </div>

            <Card title={t('My requests to other banks')}>
                {!outgoing.length && <Empty>{t('You have not asked other banks for blood.')}</Empty>}
                {outgoing.length > 0 && (
                    <TableWrap>
                        <thead><tr><th>{t('Sent')}</th><th>{t('To')}</th><th>{t('Group')}</th><th>{t('Units')}</th><th>{t('Urgency')}</th><th>{t('Status')}</th><th>{t('Note')}</th></tr></thead>
                        <tbody>
                            {outgoing.map((tr) => (
                                <tr key={tr.id}>
                                    <td>{formatDateTime(tr.created_at)}</td>
                                    <td>{tr.to_bank_name}</td>
                                    <td>{tr.blood_type}</td>
                                    <td>{tr.units}</td>
                                    <td><Badge value={tr.urgency} /></td>
                                    <td><Badge value={tr.status} /></td>
                                    <td className="muted">
                                        {tr.unit_numbers?.length ? t('Bags: {list}', { list: tr.unit_numbers.join(', ') }) : tr.rejection_reason || tr.notes || ''}
                                    </td>
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
function Transactions({ donations, requests, transfers, removed, bankId }) {
    const { t } = useI18n();
    const rows = useMemo(() => {
        const bagList = (numbers) => (numbers?.length ? t('Bags: {list}', { list: numbers.join(', ') }) : '');
        const list = [];
        for (const d of donations || []) {
            list.push({
                key: `d${d.id}`, at: d.created_at, type: t('Donation received'), party: d.donor_name, blood_type: d.blood_type, change: +d.units,
                extra: [
                    d.unit_number,
                    d.volume_ml != null && `${d.volume_ml} mL`,
                    d.classification === 'low_volume' && t('red cells only'),
                    t('expires {date}', { date: formatDate(d.expiry_date) }),
                ].filter(Boolean).join(' · '),
                classification: d.classification,
            });
        }
        for (const r of requests || []) {
            if (r.status === 'approved') {
                list.push({
                    key: `r${r.id}`, at: r.updated_at, type: t('Issued to recipient'), party: r.recipient_name, blood_type: r.blood_type,
                    change: -r.units, extra: bagList(r.unit_numbers),
                });
            }
        }
        for (const tr of transfers || []) {
            if (tr.status !== 'approved') continue;
            const outgoing = tr.to_bank_id === bankId;
            list.push({
                key: `t${tr.id}`, at: tr.updated_at,
                type: outgoing ? t('Transferred to bank') : t('Received from bank'),
                party: outgoing ? tr.from_bank_name : tr.to_bank_name,
                blood_type: tr.blood_type, change: outgoing ? -tr.units : +tr.units, extra: bagList(tr.unit_numbers),
            });
        }
        // Bags that left the stock without being used: expired or discarded.
        for (const bag of removed || []) {
            list.push({
                key: `u${bag.id}`, at: bag.status_changed_at,
                type: bag.status === 'expired' ? t('Expired') : t('Discarded'),
                party: '-', blood_type: bag.blood_type, change: -1,
                extra: [bag.unit_number, bag.discard_reason && t(DISCARD_REASON_LABELS[bag.discard_reason])].filter(Boolean).join(' · '),
            });
        }
        return list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    }, [donations, requests, transfers, removed, bankId, t]);

    return (
        <Card title={t('Transaction history')}>
            {!rows.length && <Empty>{t('No stock movements yet.')}</Empty>}
            {rows.length > 0 && (
                <TableWrap>
                    <thead><tr><th>{t('When')}</th><th>{t('Type')}</th><th>{t('Party')}</th><th>{t('Group')}</th><th>{t('Units')}</th><th /></tr></thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.key}>
                                <td>{formatDateTime(r.at)}</td>
                                <td>{r.type}{r.classification === 'low_volume' && <Badge value="low_volume">{t('low volume')}</Badge>}</td>
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
