import { Fragment, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { BLOOD_TYPES, COMPATIBILITY, INDICATION_LABELS, formatDateTime } from '../constants.js';
import { useAction, useApi } from '../hooks.js';
import { useI18n } from '../i18n.jsx';
import { DeliveryTracker } from './Delivery.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, TableWrap } from './ui.jsx';

// Blood request features shared by recipients and by donors who need blood themselves.

/*
 * Approved blood banks with their contacts, the user's region first. Blood stock is confidential to
 * each bank, so a person who needs blood chooses a bank and sends a request; the bank answers.
 */
export function BloodBanks({ bloodType, region, onRequest }) {
    const { t } = useI18n();
    const banks = useApi('/users?role=bloodbank');
    const [search, setSearch] = useState('');
    const [type, setType] = useState(bloodType || '');
    const term = search.trim().toLowerCase();
    const list = (banks.data || [])
        .filter((b) => !term || `${b.name} ${b.region ?? ''} ${b.address ?? ''}`.toLowerCase().includes(term))
        .sort((a, b) => (b.region === region) - (a.region === region) || a.name.localeCompare(b.name));

    return (
        <>
            <Card title={t('Blood banks')} actions={
                <input className="search" type="search" placeholder={t('Search by name or region')} value={search} onChange={(e) => setSearch(e.target.value)} />
            }>
                <p className="note-box small">
                    {t("Blood stock is kept confidential by each blood bank. When a doctor asks for blood for a patient in hospital, choose the blood bank that serves the hospital and send a request with the doctor's details: the bank confirms with the doctor, checks its stock and answers you here.")}
                </p>
                {banks.loading && !banks.data && <Loading />}
                {banks.data && !list.length && <Empty>{t('No blood banks found.')}</Empty>}
                <div className="bank-list">
                    {list.map((b) => (
                        <article key={b.id} className="bank-card">
                            <header>
                                <h3>{b.name}{region && b.region === region && <Badge value="approved">{t('Your region')}</Badge>}</h3>
                                <p className="muted small">{[b.region, b.address].filter(Boolean).join(' · ')}</p>
                                {b.phone && <p className="small"><a href={`tel:${b.phone}`}>{b.phone}</a></p>}
                            </header>
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => onRequest(b)}>{t('Request blood here')}</button>
                        </article>
                    ))}
                </div>
            </Card>
            <Card title={t('Which blood groups can a patient receive?')} actions={
                <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('Blood group')}>
                    <option value="">{t('Choose blood group')}</option>
                    {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                </select>
            }>
                {!type && <Empty>{t("Choose the patient's blood group.")}</Empty>}
                {type && (
                    <p>
                        {t('A {type} patient can receive red cells from: {list}.', { type, list: COMPATIBILITY[type].join(', ') })}
                        {' '}<span className="muted small">{t('The blood bank chooses compatible blood when it answers your request.')}</span>
                    </p>
                )}
            </Card>
        </>
    );
}

/*
 * Blood is asked for a patient who is in hospital, on a doctor's advice: the form names the patient,
 * hospital, ward, reason and doctor, and the bank confirms with the doctor before approving.
 * note: optional text shown above the submit button (e.g. the donor priority rule).
 */
export function RequestBlood({ defaultType, defaultBankId, onSent, note }) {
    const { t } = useI18n();
    const { user } = useAuth();
    const banks = useApi('/users?role=bloodbank');
    const action = useAction();
    const empty = {
        blood_bank_id: defaultBankId ? String(defaultBankId) : '', blood_type: defaultType || '', units: 1, urgency: 'normal', reason: '',
        patient_name: user?.name ?? '', hospital: '', ward: '', indication: '',
        doctor_name: '', doctor_reg_no: '', doctor_phone: '', doctor_declaration: false,
    };
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
                <p className="note-box small">
                    {t("Blood is given to a patient in hospital, on a doctor's advice. The blood bank calls the doctor or the hospital to confirm your request before approving it, and the blood goes to the hospital.")}
                </p>
                <Field label={t('Blood bank')}>
                    <select required value={form.blood_bank_id} onChange={set('blood_bank_id')}>
                        <option value="">{t('Select a blood bank')}</option>
                        {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}{b.region ? ` — ${b.region}` : ''}</option>)}
                    </select>
                </Field>
                <fieldset className="questionnaire">
                    <legend>{t('Patient and hospital')}</legend>
                    <Field label={t("Patient's name")}>
                        <input required maxLength={120} value={form.patient_name} onChange={set('patient_name')} />
                    </Field>
                    <div className="form-grid">
                        <Field label={t('Hospital')}>
                            <input required maxLength={150} value={form.hospital} onChange={set('hospital')} placeholder={t('e.g. Muhimbili National Hospital')} />
                        </Field>
                        <Field label={t('Ward and bed')}>
                            <input required maxLength={80} value={form.ward} onChange={set('ward')} placeholder={t('e.g. Surgical ward 5, bed 12')} />
                        </Field>
                    </div>
                    <Field label={t('Why the patient needs blood')}>
                        <select required value={form.indication} onChange={set('indication')}>
                            <option value="">{t('Select')}</option>
                            {Object.entries(INDICATION_LABELS).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                        </select>
                    </Field>
                </fieldset>
                <fieldset className="questionnaire">
                    <legend>{t('Doctor who asked for the blood')}</legend>
                    <div className="form-grid">
                        <Field label={t("Doctor's name")}>
                            <input required maxLength={120} value={form.doctor_name} onChange={set('doctor_name')} placeholder="Dr." />
                        </Field>
                        <Field label={t("Doctor's phone")}>
                            <input required type="tel" maxLength={30} value={form.doctor_phone} onChange={set('doctor_phone')} placeholder="07XX XXX XXX" />
                        </Field>
                    </div>
                    <Field label={t('MCT registration number (optional)')} hint={t("As written on the doctor's blood request form.")}>
                        <input maxLength={40} value={form.doctor_reg_no} onChange={set('doctor_reg_no')} />
                    </Field>
                </fieldset>
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
                <Field label={t('Clinical notes (optional)')}>
                    <textarea rows={2} maxLength={255} value={form.reason} onChange={set('reason')} placeholder={t('e.g. Operation planned for tomorrow morning')} />
                </Field>
                <label className="check check-top">
                    <input type="checkbox" required checked={form.doctor_declaration}
                        onChange={(e) => setForm({ ...form, doctor_declaration: e.target.checked })} />
                    {t('I confirm that a doctor asked for this blood for this patient, who is in this hospital.')}
                </label>
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
                                <td>
                                    {r.bank_name}
                                    {r.hospital && <div className="muted small">{t('For {patient} at {hospital}', { patient: r.patient_name, hospital: r.hospital })}</div>}
                                </td>
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
