import { useCallback, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { FindBlood, MyRequests, RequestBlood } from '../../components/BloodRequests.jsx';
import DonorCard from '../../components/DonorCard.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, Stat, TableWrap, Tabs } from '../../components/ui.jsx';
import { appointmentNote, formatDate, todayString } from '../../constants.js';
import { useAction, useApi, useLiveRefresh, useScreening } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';
import { downloadCertificate } from '../../utils/certificate.js';

export default function DonorDashboard() {
    const { user, refresh } = useAuth();
    const { t } = useI18n();
    const [tab, setTab] = useState('overview');
    const appointments = useApi('/appointments');
    const donations = useApi('/donations');
    const eligibility = useApi('/appointments/eligibility');
    const requests = useApi('/blood-requests');
    const appeals = useApi('/appeals');
    const card = useApi('/donors/card');
    // Bank and appeal chosen from an appeal card; they pre-fill the booking form.
    const [preset, setPreset] = useState(null);

    const { reload: reloadAppointments } = appointments;
    const { reload: reloadDonations } = donations;
    const { reload: reloadEligibility } = eligibility;
    const { reload: reloadRequests } = requests;
    const { reload: reloadAppeals } = appeals;
    const { reload: reloadCard } = card;
    // refresh() reloads the donor's profile, e.g. after a blood bank confirms the blood group.
    const reloadAll = useCallback(() => {
        reloadAppointments(); reloadDonations(); reloadEligibility(); reloadRequests(); reloadAppeals(); reloadCard();
        refresh().catch(() => {});
    }, [reloadAppointments, reloadDonations, reloadEligibility, reloadRequests, reloadAppeals, reloadCard, refresh]);
    useLiveRefresh(reloadAll);
    const openAppointment = appointments.data?.find((a) => a.status === 'pending' || a.status === 'approved');
    const pendingRequests = requests.data?.filter((r) => r.status === 'pending').length ?? 0;
    const donationCount = donations.data?.length ?? 0;

    return (
        <div className="page">
            <div className="page-head">
                <h1>{t('Welcome, {name}', { name: user.name.split(' ')[0] })}</h1>
                <p className="muted">
                    {t('Donor')} · {t('Blood group')} <strong>{user.blood_type || t('not set')}</strong>
                    {user.blood_type && (user.blood_type_confirmed_at
                        ? <Badge value="approved">{t('confirmed by {bank}', { bank: user.blood_type_confirmed_by_name || t('a blood bank') })}</Badge>
                        : <Badge value="pending">{t('not yet confirmed')}</Badge>)}
                </p>
                {user.blood_type && !user.blood_type_confirmed_at && (
                    <p className="muted small">{t('The blood group you entered is confirmed by a grouping test at your first donation.')}</p>
                )}
            </div>

            <Tabs active={tab} onChange={setTab} tabs={[
                { id: 'overview', label: t('Overview') },
                { id: 'book', label: t('Book donation') },
                { id: 'appointments', label: t('My appointments') },
                { id: 'history', label: t('Donation history'), count: donations.data?.length },
                { id: 'need', label: t('I need blood'), count: pendingRequests },
                { id: 'find', label: t('Find blood') },
            ]} />

            {tab === 'overview' && (
                <Overview donations={donations.data} eligibility={eligibility.data} openAppointment={openAppointment} appeals={appeals.data} card={card.data}
                    onBook={(appeal) => { setPreset(appeal ? { bankId: appeal.blood_bank_id, appealId: appeal.id, bankName: appeal.bank_name } : null); setTab('book'); }} />
            )}
            {tab === 'book' && (
                <BookDonation key={preset?.appealId ?? 'none'} preset={preset} openAppointment={openAppointment}
                    onBooked={() => { setPreset(null); reloadAll(); setTab('appointments'); }} />
            )}
            {tab === 'appointments' && <Appointments state={appointments} />}
            {tab === 'history' && <History state={donations} donorName={user.name} />}
            {tab === 'need' && (
                <div className="two-col">
                    <RequestBlood defaultType={user.blood_type} onSent={reloadRequests} note={donationCount > 0
                        ? t('You have {count} verified donation(s), so your request is placed ahead of other requests with the same urgency. Emergency (critical) requests from any patient always come first.', { count: donationCount })
                        : t('After your first verified donation, your requests are placed ahead of other requests with the same urgency. Emergency (critical) requests always come first.')} />
                    <MyRequests state={requests} />
                </div>
            )}
            {tab === 'find' && <FindBlood bloodType={user.blood_type} />}
        </div>
    );
}

function Overview({ donations, eligibility, openAppointment, appeals, card, onBook }) {
    const { t } = useI18n();
    const totalUnits = donations?.reduce((s, d) => s + d.units, 0) ?? 0;
    const last = donations?.[0];
    const openAppeals = (appeals || []).filter((a) => !a.booked);
    return (
        <>
            {openAppeals.map((a) => (
                <div key={a.id} className="appeal-card" role="alert">
                    <div>
                        <div className="appeal-title">{t('Urgent: {bank} needs {bloodType} blood', { bank: a.bank_name, bloodType: a.blood_type })}</div>
                        <div className="small">
                            {t('You can donate now and your blood group matches. The appeal is open until {date}.', { date: formatDate(a.expires_at) })}
                            {a.message && <> · <em>{a.message}</em></>}
                        </div>
                        <div className="muted small">{[a.bank_region, a.bank_address, a.bank_phone].filter(Boolean).join(' · ')}</div>
                    </div>
                    {!openAppointment && <button type="button" className="btn btn-primary" onClick={() => onBook(a)}>{t('Book now')}</button>}
                </div>
            ))}
            <div className="stats">
                <Stat label={t('Verified donations')} value={donations?.length ?? '–'} hint={t('{units} unit(s) in total', { units: totalUnits })} />
                <Stat label={t('Last donation')} value={last ? formatDate(last.donation_date) : t('None yet')} hint={last?.bank_name} />
                <Stat
                    label={t('Eligibility today')}
                    tone={eligibility?.eligible ? 'good' : 'warn'}
                    value={eligibility ? (eligibility.eligible ? t('Eligible') : t('Not yet')) : '–'}
                    hint={eligibility?.nextEligibleDate ? t('From {date}', { date: formatDate(eligibility.nextEligibleDate) }) : eligibility?.reason}
                />
                <Stat label={t('Lives you may have helped')} value={donations ? donations.length * 3 : '–'} hint={t('One donation can help up to 3 patients')} />
            </div>
            <div className="two-col">
                <DonorCard card={card} />
                <Card title={t('Next step')}>
                    {openAppointment ? (
                        <p>
                            {t('You have an appointment at {bank} on {date}', { bank: openAppointment.bank_name, date: formatDate(openAppointment.appointment_date) })}
                            {' '}— <Badge value={openAppointment.status} />
                        </p>
                    ) : eligibility?.eligible ? (
                        <p>{t('You are eligible to donate.')} <button type="button" className="btn btn-primary btn-sm" onClick={() => onBook(null)}>{t('Book a donation')}</button></p>
                    ) : (
                        <p>{eligibility?.reason || t('Loading…')}</p>
                    )}
                </Card>
            </div>
        </>
    );
}

function BookDonation({ preset, openAppointment, onBooked }) {
    const { t } = useI18n();
    const banks = useApi('/users?role=bloodbank');
    const screening = useScreening();
    const action = useAction();
    const [form, setForm] = useState({ blood_bank_id: preset ? String(preset.bankId) : '', appointment_date: preset ? todayString() : '', notes: '' });
    const [answers, setAnswers] = useState({});
    const questions = screening.data?.questions ?? [];
    const allAnswered = questions.length > 0 && questions.every((q) => typeof answers[q.id] === 'boolean');

    async function submit(e) {
        e.preventDefault();
        // The booking answers the appeal only while the appeal's blood bank is still selected.
        const appealId = preset && String(preset.bankId) === String(form.blood_bank_id) ? preset.appealId : undefined;
        const ok = await action.run(() => api('/appointments', { method: 'POST', body: { ...form, questionnaire: answers, appeal_id: appealId } }));
        if (ok) setTimeout(onBooked, 900);
    }

    if (openAppointment) {
        return (
            <Card title={t('Book a donation')}>
                <p>{t('You already have an open appointment on {date} at {bank}. You can book again after it is completed or rejected.',
                    { date: formatDate(openAppointment.appointment_date), bank: openAppointment.bank_name })}</p>
            </Card>
        );
    }

    return (
        <Card title={t('Book a donation')}>
            <form className="stack narrow" onSubmit={submit}>
                <Alert message={action.message} onClose={() => action.setMessage(null)} />
                {preset && <p className="note-box small">{t('You are answering the urgent appeal from {bank}.', { bank: preset.bankName })}</p>}
                <Field label={t('Blood bank')}>
                    <select required value={form.blood_bank_id} onChange={(e) => setForm({ ...form, blood_bank_id: e.target.value })}>
                        <option value="">{t('Select a blood bank')}</option>
                        {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}{b.region ? ` — ${b.region}` : ''}</option>)}
                    </select>
                </Field>
                <Field label={t('Date')}>
                    <input type="date" required min={todayString()} value={form.appointment_date}
                        onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} />
                </Field>
                <Field label={t('Notes (optional)')}>
                    <textarea rows={3} maxLength={255} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder={t('Preferred time, health notes…')} />
                </Field>

                <fieldset className="questionnaire">
                    <legend>{t('Health questions')}</legend>
                    <p className="muted small">{t('Answer honestly; this protects you and the patient. The blood bank will check your health again on the day.')}</p>
                    {screening.loading && !screening.data && <Loading />}
                    {questions.map((q) => (
                        <div key={q.id} className="question" role="radiogroup" aria-label={q.text}>
                            <span>{q.text}</span>
                            <div className="segmented">
                                {[[true, t('Yes')], [false, t('No')]].map(([value, label]) => (
                                    <button type="button" key={label} role="radio" aria-checked={answers[q.id] === value}
                                        className={answers[q.id] === value ? 'seg active' : 'seg'}
                                        onClick={() => setAnswers({ ...answers, [q.id]: value })}>{label}</button>
                                ))}
                            </div>
                        </div>
                    ))}
                </fieldset>

                <p className="muted small">{t('The system checks your age (18–65), any open appointment, and that at least 90 days have passed since your last donation.')}</p>
                <button className="btn btn-primary" disabled={action.busy || !allAnswered}>{action.busy ? t('Booking…') : t('Book appointment')}</button>
            </form>
        </Card>
    );
}

function Appointments({ state }) {
    const { t } = useI18n();
    if (state.loading && !state.data) return <Loading />;
    if (!state.data?.length) return <Card><Empty>{t('No appointments yet.')}</Empty></Card>;
    return (
        <Card title={t('My appointments')}>
            <TableWrap>
                <thead><tr><th>{t('Date')}</th><th>{t('Blood bank')}</th><th>{t('Group')}</th><th>{t('Status')}</th><th>{t('Note')}</th></tr></thead>
                <tbody>
                    {state.data.map((a) => (
                        <tr key={a.id}>
                            <td>{formatDate(a.appointment_date)}</td>
                            <td>{a.bank_name}</td>
                            <td>{a.blood_type}</td>
                            <td><Badge value={a.status} /></td>
                            <td className="muted">{appointmentNote(a, t)}</td>
                        </tr>
                    ))}
                </tbody>
            </TableWrap>
        </Card>
    );
}

function History({ state, donorName }) {
    const { t } = useI18n();
    if (state.loading && !state.data) return <Loading />;
    if (!state.data?.length) {
        return <Card><Empty>{t('No verified donations yet. Your certificate appears here after the blood bank verifies a donation.')}</Empty></Card>;
    }
    return (
        <Card title={t('Donation history')}>
            <TableWrap>
                <thead><tr><th>{t('Date')}</th><th>{t('Blood bank')}</th><th>{t('Group')}</th><th>{t('Volume')}</th><th>{t('Your blood')}</th><th>{t('Certificate')}</th></tr></thead>
                <tbody>
                    {state.data.map((d) => (
                        <tr key={d.id}>
                            <td>{formatDate(d.donation_date)}</td>
                            <td>{d.bank_name}</td>
                            <td>{d.blood_type}</td>
                            <td>{d.volume_ml != null ? `${d.volume_ml} mL` : t('{units} unit(s)', { units: d.units })}</td>
                            <td>
                                {d.unit_status === 'issued' && <Badge value="issued">{t('Given to a patient')}</Badge>}
                                {d.unit_status === 'available' && <span className="muted small">{t('In stock at the bank')}</span>}
                                {!['issued', 'available'].includes(d.unit_status) && <span className="muted">–</span>}
                            </td>
                            <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => downloadCertificate(d, donorName)}>{t('Download')}</button></td>
                        </tr>
                    ))}
                </tbody>
            </TableWrap>
        </Card>
    );
}
