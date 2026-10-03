import { Fragment, useState } from 'react';
import { api } from '../../api.js';
import StockGrid from '../../components/StockGrid.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, TableWrap } from '../../components/ui.jsx';
import {
    BLOOD_TYPES, DISCARD_REASON_LABELS, EXPIRY_WARNING_DAYS, SHELF_LIFE_DAYS, UNIT_STATUS_LABELS,
    formatDate, formatDateTime, todayString,
} from '../../constants.js';
import { useAction, useApi, useLiveRefresh } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';

function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toLocaleDateString('en-CA');
}

// Stock is kept bag by bag: each bag has a number and an expiry date, and the bags that expire first are issued first.
export default function StockPanel({ stock, onChange }) {
    const { t } = useI18n();
    const action = useAction();
    const [status, setStatus] = useState('available');
    const [group, setGroup] = useState('');
    const bags = useApi(`/stock/units?status=${status}${group ? `&bloodType=${encodeURIComponent(group)}` : ''}`);
    const { reload: reloadBags } = bags;
    useLiveRefresh(reloadBags);

    function changed() {
        reloadBags();
        onChange();
    }

    return (
        <>
            <div className="two-col">
                <Card title={t('Stock by blood group')}>
                    {stock.data ? <StockGrid rows={stock.data} /> : <Loading />}
                    {stock.data && (
                        <TableWrap>
                            <thead><tr><th>{t('Group')}</th><th>{t('Units')}</th><th>{t('Expiring soon')}</th><th>{t('Last updated')}</th></tr></thead>
                            <tbody>
                                {stock.data.map((s) => (
                                    <tr key={s.id}>
                                        <td>{s.blood_type}</td>
                                        <td>{s.units} {s.low && <Badge value="low" />}</td>
                                        <td>{s.expiring > 0 ? <Badge value="expiring">{s.expiring}</Badge> : <span className="muted">0</span>}</td>
                                        <td>{formatDateTime(s.last_updated)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    )}
                </Card>
                <ReceiveForm onDone={changed} />
            </div>

            <Card title={t('Blood bags')} actions={<>
                <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Status')}>
                    {Object.entries(UNIT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
                    <option value="all">{t('All')}</option>
                </select>
                <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('Blood group')}>
                    <option value="">{t('All groups')}</option>
                    {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                </select>
            </>}>
                <Alert message={action.message} onClose={() => action.setMessage(null)} />
                <p className="muted small">
                    {t('Bags that expire first are issued first. A bag past its expiry date leaves the stock automatically and is never issued; you are warned {days} days before.', { days: EXPIRY_WARNING_DAYS })}
                </p>
                {bags.loading && !bags.data && <Loading />}
                {bags.data && !bags.data.length && <Empty>{t('No bags to show.')}</Empty>}
                {bags.data?.length > 0 && <BagTable rows={bags.data} action={action} onChange={changed} />}
            </Card>
        </>
    );
}

const FIRST_ROWS = 25;

// Bags in stock are listed in the order they will be issued.
function BagTable({ rows, action, onChange }) {
    const { t } = useI18n();
    const [discarding, setDiscarding] = useState(null);
    const [form, setForm] = useState({ reason: 'damaged', notes: '' });
    const [showAll, setShowAll] = useState(false);
    const shown = showAll ? rows : rows.slice(0, FIRST_ROWS);

    function start(bag) {
        setForm({ reason: 'damaged', notes: '' });
        setDiscarding(bag.id);
    }

    async function discard(bag) {
        const ok = await action.run(() => api(`/stock/units/${bag.id}/discard`, { method: 'PATCH', body: form }));
        if (ok) { setDiscarding(null); onChange(); }
    }

    return (
        <>
            <TableWrap>
                <thead>
                    <tr><th>{t('Bag number')}</th><th>{t('Group')}</th><th>{t('Source')}</th><th>{t('Collected')}</th><th>{t('Expires')}</th><th>{t('Status')}</th><th /></tr>
                </thead>
                <tbody>
                    {shown.map((bag) => (
                        <Fragment key={bag.id}>
                            <tr className={discarding === bag.id ? 'row-open' : bag.status === 'available' && bag.state !== 'ok' ? 'row-urgent' : ''}>
                                <td><strong>{bag.unit_number}</strong></td>
                                <td>{bag.blood_type}</td>
                                <td>
                                    <BagSource bag={bag} />
                                </td>
                                <td>{formatDate(bag.collected_on)}</td>
                                <td>
                                    {formatDate(bag.expiry_date)}
                                    {bag.status === 'available' && <div><ExpiryBadge bag={bag} /></div>}
                                </td>
                                <td>
                                    <Badge value={bag.status}>{t(UNIT_STATUS_LABELS[bag.status])}</Badge>
                                    <BagOutcome bag={bag} />
                                </td>
                                <td className="actions">
                                    {bag.status === 'available' && discarding !== bag.id && (
                                        <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => start(bag)}>{t('Discard')}</button>
                                    )}
                                </td>
                            </tr>
                            {discarding === bag.id && (
                                <tr className="dday-row">
                                    <td colSpan={7}>
                                        <div className="dday-defer stack">
                                            <div className="form-grid">
                                                <Field label={t('Why is the bag discarded?')}>
                                                    <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                                                        {Object.entries(DISCARD_REASON_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
                                                    </select>
                                                </Field>
                                                <Field label={form.reason === 'other' ? t('Explain') : t('Notes (optional)')}>
                                                    <input maxLength={255} required={form.reason === 'other'} value={form.notes}
                                                        onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                                                </Field>
                                            </div>
                                            <div className="actions">
                                                <button type="button" className="btn btn-sm btn-danger"
                                                    disabled={action.busy || (form.reason === 'other' && !form.notes.trim())}
                                                    onClick={() => discard(bag)}>
                                                    {t('Discard bag {number}', { number: bag.unit_number })}
                                                </button>
                                                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDiscarding(null)}>{t('Cancel')}</button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </Fragment>
                    ))}
                </tbody>
            </TableWrap>
            {rows.length > shown.length && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowAll(true)}>
                    {t('Show all {count} bags', { count: rows.length })}
                </button>
            )}
        </>
    );
}

function BagSource({ bag }) {
    const { t } = useI18n();
    let text;
    if (bag.source === 'donation') text = bag.donor_name ? t('Donation · {name}', { name: bag.donor_name }) : t('Donation');
    else if (bag.source === 'opening') text = t('Opening stock');
    else text = t('Received from outside');
    return (
        <>
            {text}
            {bag.classification === 'low_volume' && <Badge value="low_volume">{t('red cells only')}</Badge>}
            {bag.transferred_from && <div className="muted small">{t('Transferred from {bank}', { bank: bag.transferred_from })}</div>}
        </>
    );
}

function ExpiryBadge({ bag }) {
    const { t } = useI18n();
    if (bag.state === 'expired') return <Badge value="expired">{t('Expired')}</Badge>;
    const text = bag.daysLeft === 0 ? t('Expires today') : t('{days} day(s) left', { days: bag.daysLeft });
    return bag.state === 'expiring' ? <Badge value="expiring">{text}</Badge> : <span className="muted small">{text}</span>;
}

function BagOutcome({ bag }) {
    const { t } = useI18n();
    if (bag.status === 'issued') {
        return <div className="muted small">{t('To {name}', { name: bag.issued_to || '-' })} · {formatDateTime(bag.status_changed_at)}</div>;
    }
    if (bag.status === 'discarded') {
        return <div className="muted small">{[t(DISCARD_REASON_LABELS[bag.discard_reason]), bag.discard_notes].filter(Boolean).join(' · ')}</div>;
    }
    if (bag.status === 'expired') return <div className="muted small">{formatDateTime(bag.status_changed_at)}</div>;
    return null;
}

// Bags received outside the donation workflow (for example from a hospital). Verified donations are added automatically.
function ReceiveForm({ onDone }) {
    const { t } = useI18n();
    const action = useAction();
    const [form, setForm] = useState({ blood_type: 'O+', units: 1, collected_on: todayString() });

    async function submit(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/stock', { method: 'POST', body: { ...form, units: Number(form.units) } }));
        if (ok) { setForm({ ...form, units: 1 }); onDone(); }
    }

    return (
        <Card title={t('Receive blood bags')}>
            <form className="stack" onSubmit={submit}>
                <Alert message={action.message} onClose={() => action.setMessage(null)} />
                <div className="form-grid">
                    <Field label={t('Blood group')}>
                        <select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })}>
                            {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                        </select>
                    </Field>
                    <Field label={t('Number of bags')}>
                        <input type="number" min={1} max={500} required value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
                    </Field>
                </div>
                <Field label={t('Collected on')} hint={t('Each bag expires {days} days after collection.', { days: SHELF_LIFE_DAYS })}>
                    <input type="date" required min={daysAgo(SHELF_LIFE_DAYS)} max={todayString()} value={form.collected_on}
                        onChange={(e) => setForm({ ...form, collected_on: e.target.value })} />
                </Field>
                <p className="muted small">{t('Use for blood received outside the donation workflow. Verified donations are added automatically, one bag per donation.')}</p>
                <button className="btn btn-primary" disabled={action.busy}>{t('Add bags')}</button>
            </form>
        </Card>
    );
}
