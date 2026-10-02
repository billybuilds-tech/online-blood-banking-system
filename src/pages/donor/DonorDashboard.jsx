import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import BanksStock from '../../components/BanksStock.jsx';
import { Alert, Badge, Card, Empty, Field, Loading, Stat, TableWrap, Tabs } from '../../components/ui.jsx';
import { formatDate, todayString } from '../../constants.js';
import { useAction, useApi } from '../../hooks.js';
import { downloadCertificate } from '../../utils/certificate.js';

export default function DonorDashboard() {
    const { user } = useAuth();
    const [tab, setTab] = useState('overview');
    const appointments = useApi('/appointments');
    const donations = useApi('/donations');
    const eligibility = useApi('/appointments/eligibility');

    const reloadAll = () => { appointments.reload(); donations.reload(); eligibility.reload(); };
    const openAppointment = appointments.data?.find((a) => a.status === 'pending' || a.status === 'approved');

    return (
        <div className="page">
            <div className="page-head">
                <h1>Welcome, {user.name.split(' ')[0]}</h1>
                <p className="muted">Donor · Blood group <strong>{user.blood_type || 'not set'}</strong></p>
            </div>

            <Tabs active={tab} onChange={setTab} tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'book', label: 'Book donation' },
                { id: 'appointments', label: 'My appointments' },
                { id: 'history', label: 'Donation history', count: donations.data?.length },
                { id: 'banks', label: 'Blood banks' },
            ]} />

            {tab === 'overview' && (
                <Overview donations={donations.data} eligibility={eligibility.data} openAppointment={openAppointment} onBook={() => setTab('book')} />
            )}
            {tab === 'book' && <BookDonation openAppointment={openAppointment} onBooked={() => { reloadAll(); setTab('appointments'); }} />}
            {tab === 'appointments' && <Appointments state={appointments} />}
            {tab === 'history' && <History state={donations} donorName={user.name} />}
            {tab === 'banks' && <BanksStock />}
        </div>
    );
}

function Overview({ donations, eligibility, openAppointment, onBook }) {
    const totalUnits = donations?.reduce((s, d) => s + d.units, 0) ?? 0;
    const last = donations?.[0];
    return (
        <>
            <div className="stats">
                <Stat label="Verified donations" value={donations?.length ?? '–'} hint={`${totalUnits} unit(s) in total`} />
                <Stat label="Last donation" value={last ? formatDate(last.donation_date) : 'None yet'} hint={last?.bank_name} />
                <Stat
                    label="Eligibility today"
                    tone={eligibility?.eligible ? 'good' : 'warn'}
                    value={eligibility ? (eligibility.eligible ? 'Eligible' : 'Not yet') : '–'}
                    hint={eligibility?.nextEligibleDate ? `From ${formatDate(eligibility.nextEligibleDate)}` : eligibility?.reason}
                />
                <Stat label="Lives you may have helped" value={donations ? donations.length * 3 : '–'} hint="One donation can help up to 3 patients" />
            </div>
            <Card title="Next step">
                {openAppointment ? (
                    <p>
                        You have an appointment at <strong>{openAppointment.bank_name}</strong> on{' '}
                        <strong>{formatDate(openAppointment.appointment_date)}</strong> — <Badge value={openAppointment.status} />
                    </p>
                ) : eligibility?.eligible ? (
                    <p>You are eligible to donate. <button type="button" className="btn btn-primary btn-sm" onClick={onBook}>Book a donation</button></p>
                ) : (
                    <p>{eligibility?.reason || 'Loading…'}</p>
                )}
            </Card>
        </>
    );
}

function BookDonation({ openAppointment, onBooked }) {
    const banks = useApi('/users?role=bloodbank');
    const action = useAction();
    const [form, setForm] = useState({ blood_bank_id: '', appointment_date: '', notes: '' });

    async function submit(e) {
        e.preventDefault();
        const ok = await action.run(() => api('/appointments', { method: 'POST', body: form }));
        if (ok) setTimeout(onBooked, 900);
    }

    if (openAppointment) {
        return <Card title="Book a donation"><p>You already have an open appointment on {formatDate(openAppointment.appointment_date)} at {openAppointment.bank_name}. You can book again after it is completed or rejected.</p></Card>;
    }

    return (
        <Card title="Book a donation">
            <form className="stack narrow" onSubmit={submit}>
                <Alert message={action.message} onClose={() => action.setMessage(null)} />
                <Field label="Blood bank">
                    <select required value={form.blood_bank_id} onChange={(e) => setForm({ ...form, blood_bank_id: e.target.value })}>
                        <option value="">Select a blood bank</option>
                        {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}{b.region ? ` — ${b.region}` : ''}</option>)}
                    </select>
                </Field>
                <Field label="Date">
                    <input type="date" required min={todayString()} value={form.appointment_date}
                        onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} />
                </Field>
                <Field label="Notes (optional)">
                    <textarea rows={3} maxLength={255} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Preferred time, health notes…" />
                </Field>
                <p className="muted small">The system checks your age (18–65), any open appointment, and that at least 90 days have passed since your last donation.</p>
                <button className="btn btn-primary" disabled={action.busy}>{action.busy ? 'Booking…' : 'Book appointment'}</button>
            </form>
        </Card>
    );
}

function Appointments({ state }) {
    if (state.loading && !state.data) return <Loading />;
    if (!state.data?.length) return <Card><Empty>No appointments yet.</Empty></Card>;
    return (
        <Card title="My appointments">
            <TableWrap>
                <thead><tr><th>Date</th><th>Blood bank</th><th>Group</th><th>Status</th><th>Note</th></tr></thead>
                <tbody>
                    {state.data.map((a) => (
                        <tr key={a.id}>
                            <td>{formatDate(a.appointment_date)}</td>
                            <td>{a.bank_name}</td>
                            <td>{a.blood_type}</td>
                            <td><Badge value={a.status} /></td>
                            <td className="muted">{a.rejection_reason || a.notes || ''}</td>
                        </tr>
                    ))}
                </tbody>
            </TableWrap>
        </Card>
    );
}

function History({ state, donorName }) {
    if (state.loading && !state.data) return <Loading />;
    if (!state.data?.length) return <Card><Empty>No verified donations yet. Your certificate appears here after the blood bank verifies a donation.</Empty></Card>;
    return (
        <Card title="Donation history">
            <TableWrap>
                <thead><tr><th>Date</th><th>Blood bank</th><th>Group</th><th>Volume</th><th>Certificate</th></tr></thead>
                <tbody>
                    {state.data.map((d) => (
                        <tr key={d.id}>
                            <td>{formatDate(d.donation_date)}</td>
                            <td>{d.bank_name}</td>
                            <td>{d.blood_type}</td>
                            <td>{d.volume_ml != null ? `${d.volume_ml} mL` : `${d.units} unit`}</td>
                            <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => downloadCertificate(d, donorName)}>Download</button></td>
                        </tr>
                    ))}
                </tbody>
            </TableWrap>
        </Card>
    );
}
