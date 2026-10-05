import { useState } from 'react';
import { api } from '../../api.js';
import { CampaignItem, CampaignProgress } from '../../components/Campaigns.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, TableWrap } from '../../components/ui.jsx';
import { REGIONS, appointmentNote, todayString } from '../../constants.js';
import { useAction } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';

/*
 * Blood donation campaigns of this bank (as NBTS runs them at schools, places of worship and
 * workplaces): plan one, see registrations and units collected against the target, or cancel it.
 */
export default function CampaignsPanel({ state, appointments, region, onChange }) {
    const { t } = useI18n();
    const action = useAction();
    const empty = { title: '', venue: '', region: region || '', campaign_date: '', start_time: '08:00', end_time: '14:00', target_units: 50, description: '' };
    const [form, setForm] = useState(empty);
    const [open, setOpen] = useState(null);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function create(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/campaigns', { method: 'POST', body: { ...form, target_units: Number(form.target_units) } }));
        if (ok) { setForm(empty); onChange(); }
    }

    async function cancel(c) {
        const reason = window.prompt(t('Reason for cancelling (optional):'));
        if (reason === null) return;
        const ok = await action.run(() => api(`/campaigns/${c.id}/cancel`, { method: 'PATCH', body: { reason } }));
        if (ok) onChange();
    }

    const campaigns = state.data || [];
    const donorsOf = (c) => (appointments || []).filter((a) => a.campaign_id === c.id);

    return (
        <>
            <Alert message={action.message} onClose={() => action.setMessage(null)} />
            <div className="two-col campaign-layout">
                <Card title={t('Campaigns')}>
                    <p className="muted small">
                        {t('Donors of the region who can give on the day are invited when you create a campaign. They register with the usual health questions, and you check their health on the day under Donations.')}
                    </p>
                    {state.loading && !state.data && <Loading />}
                    {state.data && !campaigns.length && <Empty>{t('No campaigns yet. Plan the first one with the form.')}</Empty>}
                    <div className="campaign-list">
                        {campaigns.map((c) => (
                            <CampaignItem key={c.id} campaign={c} aside={
                                <>
                                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>
                                        {open === c.id ? t('Hide donors') : t('Donors ({count})', { count: c.registered })}
                                    </button>
                                    {(c.state === 'upcoming' || c.state === 'today') && (
                                        <button type="button" className="btn btn-sm btn-ghost danger-text" disabled={action.busy} onClick={() => cancel(c)}>{t('Cancel campaign')}</button>
                                    )}
                                </>
                            }>
                                {c.state !== 'cancelled' && <CampaignProgress campaign={c} />}
                                {open === c.id && (
                                    donorsOf(c).length ? (
                                        <TableWrap>
                                            <thead><tr><th>{t('Donor')}</th><th>{t('Group')}</th><th>{t('Phone')}</th><th>{t('Status')}</th></tr></thead>
                                            <tbody>
                                                {donorsOf(c).map((a) => (
                                                    <tr key={a.id}>
                                                        <td>{a.donor_name}</td>
                                                        <td>{a.blood_type}</td>
                                                        <td>{a.donor_phone || '-'}</td>
                                                        <td><Badge value={a.status} /><div className="muted small">{appointmentNote(a, t)}</div></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </TableWrap>
                                    ) : <Empty>{t('No donor has registered yet.')}</Empty>
                                )}
                            </CampaignItem>
                        ))}
                    </div>
                </Card>

                <Card title={t('Plan a campaign')}>
                    <form className="stack" onSubmit={create}>
                        <Field label={t('Title')}>
                            <input required maxLength={150} value={form.title} onChange={set('title')} placeholder={t('e.g. Azania Secondary School blood drive')} />
                        </Field>
                        <Field label={t('Venue')}>
                            <input required maxLength={200} value={form.venue} onChange={set('venue')} placeholder={t('e.g. School hall, Kariakoo')} />
                        </Field>
                        <div className="form-grid">
                            <Field label={t('Region')}>
                                <select required value={form.region} onChange={set('region')}>
                                    <option value="">{t('Select region')}</option>
                                    {REGIONS.map((r) => <option key={r}>{r}</option>)}
                                </select>
                            </Field>
                            <Field label={t('Date')}>
                                <input type="date" required min={todayString()} value={form.campaign_date} onChange={set('campaign_date')} />
                            </Field>
                            <Field label={t('Starts')}>
                                <input type="time" required value={form.start_time} onChange={set('start_time')} />
                            </Field>
                            <Field label={t('Ends')}>
                                <input type="time" required value={form.end_time} onChange={set('end_time')} />
                            </Field>
                        </div>
                        <Field label={t('Target (units)')}>
                            <input type="number" required min={1} max={1000} value={form.target_units} onChange={set('target_units')} />
                        </Field>
                        <Field label={t('Description (optional)')}>
                            <textarea rows={3} maxLength={500} value={form.description} onChange={set('description')}
                                placeholder={t('e.g. Open to students over 18, staff and parents. Eat well before you come.')} />
                        </Field>
                        <button className="btn btn-primary" disabled={action.busy}>{action.busy ? t('Sending…') : t('Create and invite donors')}</button>
                    </form>
                </Card>
            </div>
        </>
    );
}
