import { useState } from 'react';
import { api } from '../../api.js';
import { Alert, Badge, Card, Empty, Field, Loading, TableWrap } from '../../components/ui.jsx';
import { BLOOD_TYPES, COMPATIBILITY, LOW_STOCK, formatDate, formatDateTime } from '../../constants.js';
import { useAction } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';

// Urgent appeals to eligible donors (as in BISKIT, Nigeria) and how donors responded.
export default function AppealsPanel({ state, stock, region, onChange }) {
    const { t } = useI18n();
    const action = useAction();
    const lowGroups = (stock || []).filter((s) => s.units < LOW_STOCK).map((s) => s.blood_type);
    const [form, setForm] = useState({
        blood_type: lowGroups[0] || 'O-', include_compatible: false, all_regions: false, days: 3, message: '',
    });

    async function send(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/appeals', { method: 'POST', body: { ...form, days: Number(form.days) } }));
        if (ok) { setForm({ ...form, message: '' }); onChange(); }
    }

    async function close(appeal) {
        const ok = await action.run(() => api(`/appeals/${appeal.id}/close`, { method: 'PATCH' }));
        if (ok) onChange();
    }

    const statusOf = (a) => (a.is_active ? 'active' : a.status === 'closed' ? 'closed' : 'expired');
    const groups = form.include_compatible ? COMPATIBILITY[form.blood_type] : [form.blood_type];

    return (
        <>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            <div className="two-col">
                <Card title={t('Send an urgent appeal to donors')}>
                    <form className="stack" onSubmit={send}>
                        <p className="muted small">
                            {t('The appeal goes only to donors who can donate today: right age, at least 90 days since their last donation, not deferred and with no open appointment.')}
                        </p>
                        {lowGroups.length > 0 && (
                            <div className="chips">
                                <span className="muted small">{t('Low stock:')}</span>
                                {lowGroups.map((g) => (
                                    <button type="button" key={g} className={form.blood_type === g ? 'chip active' : 'chip'}
                                        onClick={() => setForm({ ...form, blood_type: g })}>{g}</button>
                                ))}
                            </div>
                        )}
                        <div className="form-grid">
                            <Field label={t('Blood group needed')}>
                                <select value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })}>
                                    {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                                </select>
                            </Field>
                            <Field label={t('Days the appeal stays open')}>
                                <input type="number" min={1} max={14} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
                            </Field>
                        </div>
                        <label className="check">
                            <input type="checkbox" checked={form.include_compatible}
                                onChange={(e) => setForm({ ...form, include_compatible: e.target.checked })} />
                            {t('Also call donors of compatible groups')}
                        </label>
                        <label className="check">
                            <input type="checkbox" checked={form.all_regions}
                                onChange={(e) => setForm({ ...form, all_regions: e.target.checked })} />
                            {t('All regions (not only {region})', { region: region || '-' })}
                        </label>
                        <p className="note-box small">{t('Donors called: blood group {groups}', { groups: groups.join(', ') })}</p>
                        <Field label={t('Message to donors (optional)')}>
                            <input maxLength={255} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                                placeholder={t('e.g. Maternity emergency; come any time before 4 pm')} />
                        </Field>
                        <button className="btn btn-primary" disabled={action.busy}>{t('Send appeal')}</button>
                    </form>
                </Card>

                <Card title={t('Appeals and responses')}>
                    {state.loading && !state.data && <Loading />}
                    {state.data && !state.data.length && <Empty>{t('No appeals sent yet.')}</Empty>}
                    {state.data?.length > 0 && (
                        <TableWrap>
                            <thead>
                                <tr><th>{t('Group')}</th><th>{t('Sent')}</th><th>{t('Reached')}</th><th>{t('Booked')}</th><th>{t('Donated')}</th><th>{t('Status')}</th><th /></tr>
                            </thead>
                            <tbody>
                                {state.data.map((a) => (
                                    <tr key={a.id}>
                                        <td><strong>{a.blood_type}</strong>{a.include_compatible && <div className="muted small">{t('+ compatible')}</div>}</td>
                                        <td>{formatDateTime(a.created_at)}<div className="muted small">{t('until {date}', { date: formatDate(a.expires_at) })}</div></td>
                                        <td>{a.targeted}</td>
                                        <td>{a.booked}</td>
                                        <td>{a.donated}</td>
                                        <td><Badge value={statusOf(a)} /></td>
                                        <td>
                                            {a.is_active && (
                                                <button type="button" className="btn btn-sm btn-ghost" disabled={action.busy} onClick={() => close(a)}>{t('Close')}</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    )}
                </Card>
            </div>
        </>
    );
}
