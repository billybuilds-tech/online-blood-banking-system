import { Fragment, useState } from 'react';
import { api } from '../api.js';
import { BLOOD_TYPES, COMPATIBILITY, formatDateTime } from '../constants.js';
import { useAction, useApi, useLiveRefresh } from '../hooks.js';
import { useI18n } from '../i18n.jsx';
import BanksStock from './BanksStock.jsx';
import { DeliveryTracker } from './Delivery.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, TableWrap } from './ui.jsx';

// Blood request features shared by recipients and by donors who need blood themselves.

export function FindBlood({ bloodType }) {
    const { t } = useI18n();
    const [type, setType] = useState(bloodType || '');
    const compatible = useApi(type ? `/stock/compatible?bloodType=${encodeURIComponent(type)}` : null);
    useLiveRefresh(compatible.reload);

    return (
        <>
            <Card title={t('Who has blood I can receive?')} actions={
                <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('Blood group')}>
                    <option value="">{t('Choose blood group')}</option>
                    {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                </select>
            }>
                {!type && <Empty>{t("Choose the patient's blood group to see compatible stock.")}</Empty>}
                {type && (
                    <>
                        <p className="muted small">
                            {t('A {type} patient can receive red cells from: {list}. Exact matches are listed first.',
                                { type, list: COMPATIBILITY[type].join(', ') })}
                        </p>
                        {compatible.loading && !compatible.data && <Loading />}
                        {compatible.data && !compatible.data.stock.length && <Empty>{t('No compatible blood is in stock at any bank right now.')}</Empty>}
                        {compatible.data?.stock.length > 0 && (
                            <TableWrap>
                                <thead><tr><th>{t('Blood bank')}</th><th>{t('Region')}</th><th>{t('Group')}</th><th>{t('Units')}</th></tr></thead>
                                <tbody>
                                    {compatible.data.stock.map((s) => (
                                        <tr key={`${s.blood_bank_id}-${s.blood_type}`}>
                                            <td>{s.bank_name}</td>
                                            <td>{s.region}</td>
                                            <td><strong>{s.blood_type}</strong>{s.blood_type === type && <Badge value="approved">{t('exact')}</Badge>}</td>
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

// note: optional text shown above the submit button (e.g. the donor priority rule).
export function RequestBlood({ defaultType, onSent, note }) {
    const { t } = useI18n();
    const banks = useApi('/users?role=bloodbank');
    const action = useAction();
    const empty = { blood_bank_id: '', blood_type: defaultType || '', units: 1, urgency: 'normal', reason: '' };
    const [form, setForm] = useState(empty);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function submit(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/blood-requests', { method: 'POST', body: { ...form, units: Number(form.units) } }));
        if (ok) {
            setForm(empty);
            setTimeout(onSent, 900);
        }
    }

    return (
        <Card title={t('Request blood')}>
            <form className="stack narrow" onSubmit={submit}>
                <Alert message={action.message} onClose={() => action.setMessage(null)} />
                <Field label={t('Blood bank')}>
                    <select required value={form.blood_bank_id} onChange={set('blood_bank_id')}>
                        <option value="">{t('Select a blood bank')}</option>
                        {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}{b.region ? ` — ${b.region}` : ''}</option>)}
                    </select>
                </Field>
                <div className="form-grid">
                    <Field label={t('Blood group')}>
                        <select required value={form.blood_type} onChange={set('blood_type')}>
                            <option value="">{t('Select')}</option>
                            {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                        </select>
                    </Field>
                    <Field label={t('Units')}>
                        <input type="number" min={1} max={20} required value={form.units} onChange={set('units')} />
                    </Field>
                </div>
                <Field label={t('Urgency')}>
                    <div className="segmented">
                        {['normal', 'urgent', 'critical'].map((u) => (
                            <button type="button" key={u} className={form.urgency === u ? `seg active seg-${u}` : 'seg'}
                                onClick={() => setForm({ ...form, urgency: u })}>{t(u)}</button>
                        ))}
                    </div>
                </Field>
                <Field label={t('Reason / hospital (optional)')}>
                    <textarea rows={3} maxLength={255} value={form.reason} onChange={set('reason')} placeholder={t('e.g. Surgery at Muhimbili, ward 5')} />
                </Field>
                {note && <p className="note-box small">{note}</p>}
                <button className="btn btn-primary" disabled={action.busy}>{action.busy ? t('Sending…') : t('Send request')}</button>
            </form>
        </Card>
    );
}

// The user's requests; an approved one shows where the blood is, and its receipt can be confirmed here.
export function MyRequests({ state }) {
    const { t } = useI18n();
    const action = useAction();

    async function confirmReceived(r) {
        const ok = await action.run(() => api(`/blood-requests/${r.id}/delivery`, { method: 'PATCH', body: { step: 'received' } }));
        if (ok) state.reload();
    }

    if (state.loading && !state.data) return <Loading />;
    if (!state.data?.length) return <Card title={t('My requests')}><Empty>{t('You have not requested blood yet.')}</Empty></Card>;
    return (
        <Card title={t('My requests')} actions={<button type="button" className="btn btn-sm btn-ghost" onClick={state.reload}>{t('Refresh')}</button>}>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            <TableWrap>
                <thead>
                    <tr><th>{t('Sent')}</th><th>{t('Blood bank')}</th><th>{t('Group')}</th><th>{t('Units')}</th><th>{t('Urgency')}</th><th>{t('Status')}</th><th>{t('Note')}</th></tr>
                </thead>
                <tbody>
                    {state.data.map((r) => (
                        <Fragment key={r.id}>
                            <tr className={r.delivery_status ? 'row-open' : ''}>
                                <td>{formatDateTime(r.created_at)}</td>
                                <td>{r.bank_name}</td>
                                <td>{r.blood_type}</td>
                                <td>{r.units}</td>
                                <td><Badge value={r.urgency} /></td>
                                <td><Badge value={r.status} /></td>
                                <td className="muted">{r.unit_numbers?.length ? t('Bags: {list}', { list: r.unit_numbers.join(', ') }) : r.rejection_reason || ''}</td>
                            </tr>
                            {r.delivery_status && (
                                <tr className="delivery-row">
                                    <td colSpan={7}>
                                        <div className="delivery-box">
                                            <DeliveryTracker request={r} />
                                            {(r.delivery_status === 'ready' || r.delivery_status === 'dispatched') && (
                                                <button type="button" className="btn btn-sm btn-primary" disabled={action.busy} onClick={() => confirmReceived(r)}>
                                                    {t('I have received the blood')}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </Fragment>
                    ))}
                </tbody>
            </TableWrap>
        </Card>
    );
}
