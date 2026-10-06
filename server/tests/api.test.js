/*
 * Black-box API tests TC01-TC61 (TC01-TC23 are Table 5.1 of the report).
 * Start the server first (npm start), then run: npm run test:api
 * The Blood Bank Manager account from .env must exist (npm run create-admin).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import '../config.js';
import { pool, query } from '../db.js';
import { cleanTestData } from '../scripts/clean-test-data.js';
import { addDays, today } from '../utils/rules.js';

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}/api`;
const ADMIN = {
    email: process.env.ADMIN_EMAIL || 'manager@obbs.local',
    password: process.env.ADMIN_PASSWORD || 'Manager@2026',
};
const RUN = Date.now();
const PASSWORD = 'Test1234pass';
// Safe answers to every health question, and a normal donation-day health check.
const HEALTHY = { feeling_well: true, weight_ok: true, recent_illness: false, medication: false, pregnancy: false, procedure: false };
const SCREENING_OK = { weight_kg: 64, hemoglobin_g_dl: 13.6, bp_systolic: 120, bp_diastolic: 78, pulse_bpm: 70, temperature_c: 36.7 };
const s = {}; // state shared between the ordered test cases

async function api(method, path, { token, body, lang } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(lang ? { 'Accept-Language': lang } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, data };
}

const login = (email, password) => api('POST', '/auth/login', { body: { email, password } });

// Remove the accounts this run created (their records go with them) and the
// registration notices they sent to the manager, so test runs leave no trace.
after(async () => {
    try {
        await cleanTestData();
    } finally {
        await pool.end();
    }
});

async function units(bankId, bloodType) {
    const { data } = await api('GET', `/stock?bankId=${bankId}&bloodType=${encodeURIComponent(bloodType)}`, { token: s.admin });
    return data.length ? data[0].units : 0;
}

test('TC01 Server and database health check', async () => {
    const { status, data } = await api('GET', '/health');
    assert.equal(status, 200);
    assert.equal(data.database, 'connected');
});

test('TC02 Register donor with valid details', async () => {
    s.donorEmail = `donor${RUN}@test.local`;
    const { status, data } = await api('POST', '/auth/register', {
        body: { role: 'donor', name: 'Test Donor', email: s.donorEmail, password: PASSWORD, blood_type: 'O+', date_of_birth: '1998-04-12', region: 'Dar es Salaam' },
    });
    assert.equal(status, 201);
    assert.equal(data.user.role, 'donor');
});

test('TC03 Register with an existing email', async () => {
    const { status } = await api('POST', '/auth/register', {
        body: { role: 'donor', name: 'Copy', email: s.donorEmail, password: PASSWORD, blood_type: 'O+', date_of_birth: '1998-04-12' },
    });
    assert.equal(status, 409);
});

test('TC04 Register with a weak password', async () => {
    const { status } = await api('POST', '/auth/register', {
        body: { role: 'recipient', name: 'Weak', email: `weak${RUN}@test.local`, password: '123' },
    });
    assert.equal(status, 400);
});

test('TC05 Login with wrong password', async () => {
    const { status, data } = await login(s.donorEmail, 'WrongPass999');
    assert.equal(status, 401);
    assert.equal(data.token, undefined);
});

test("TC06 SQL injection text in login (' OR '1'='1)", async () => {
    const { status, data } = await login("' OR '1'='1", "' OR '1'='1");
    assert.equal(status, 401);
    assert.equal(data.token, undefined);
});

test('TC07 Profile data after login has no password or hash', async () => {
    const res = await login(s.donorEmail, PASSWORD);
    assert.equal(res.status, 200);
    s.donor = res.data.token;
    s.donorId = res.data.user.id;
    const { data } = await api('GET', '/auth/me', { token: s.donor });
    assert.equal(data.user.email, s.donorEmail);
    assert.equal(data.user.password, undefined);
    assert.equal(data.user.password_hash, undefined);
});

test('TC08 New blood bank logs in before approval', async () => {
    s.bankAEmail = `banka${RUN}@test.local`;
    s.bankBEmail = `bankb${RUN}@test.local`;
    for (const [email, name] of [[s.bankAEmail, 'Test Bank A'], [s.bankBEmail, 'Test Bank B']]) {
        const reg = await api('POST', '/auth/register', { body: { role: 'bloodbank', name, email, password: PASSWORD, region: 'Dodoma' } });
        assert.equal(reg.status, 201);
        assert.equal(reg.data.user.status, 'pending');
    }
    const { status } = await login(s.bankAEmail, PASSWORD);
    assert.equal(status, 403);
});

test('TC09 Manager approves two blood banks', async () => {
    const res = await login(ADMIN.email, ADMIN.password);
    assert.equal(res.status, 200, 'Manager login failed - run npm run create-admin');
    s.admin = res.data.token;

    const { data: pending } = await api('GET', '/users?role=bloodbank&status=pending', { token: s.admin });
    for (const email of [s.bankAEmail, s.bankBEmail]) {
        const bank = pending.find((u) => u.email === email);
        const approve = await api('PATCH', `/users/${bank.id}/status`, { token: s.admin, body: { status: 'approved' } });
        assert.equal(approve.status, 200);
        assert.equal(approve.data.user.status, 'approved');
    }

    const a = await login(s.bankAEmail, PASSWORD);
    const b = await login(s.bankBEmail, PASSWORD);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    [s.bankA, s.bankAId, s.bankB, s.bankBId] = [a.data.token, a.data.user.id, b.data.token, b.data.user.id];
});

test('TC10 API request without a token', async () => {
    const { status } = await api('GET', '/stock');
    assert.equal(status, 401);
});

test('TC11 API request with a tampered token', async () => {
    const [header, payload, signature] = s.donor.split('.');
    const forged = Buffer.from(JSON.stringify({ id: s.donorId, role: 'admin' })).toString('base64url');
    assert.notEqual(forged, payload);
    const { status } = await api('GET', '/stock', { token: `${header}.${forged}.${signature}` });
    assert.equal(status, 401);
});

test('TC12 Donor calls blood bank and manager functions', async () => {
    const stock = await api('POST', '/stock', { token: s.donor, body: { blood_type: 'O+', units: 50 } });
    const approve = await api('PATCH', `/users/${s.bankAId}/status`, { token: s.donor, body: { status: 'suspended' } });
    const send = await api('POST', '/notifications', { token: s.donor, body: { target: 'all', title: 'x', message: 'y' } });
    assert.equal(stock.status, 403);
    assert.equal(approve.status, 403);
    assert.equal(send.status, 403);
});

test('TC13 Blood banks add stock', async () => {
    const a = await api('POST', '/stock', { token: s.bankA, body: { blood_type: 'O+', units: 10 } });
    const b = await api('POST', '/stock', { token: s.bankB, body: { blood_type: 'O+', units: 2 } });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(await units(s.bankAId, 'O+'), 10);
    assert.equal(await units(s.bankBId, 'O+'), 2);
});

test('TC14 Donor books twice while first booking is open', async () => {
    const date = addDays(today(), 1);
    const first = await api('POST', '/appointments', { token: s.donor, body: { blood_bank_id: s.bankAId, appointment_date: date, questionnaire: HEALTHY } });
    const second = await api('POST', '/appointments', { token: s.donor, body: { blood_bank_id: s.bankAId, appointment_date: date, questionnaire: HEALTHY } });
    assert.equal(first.status, 201);
    assert.equal(second.status, 409);
    s.appointmentId = first.data.appointment.id;
});

test('TC15 Stock after a booking only is unchanged', async () => {
    assert.equal(await units(s.bankAId, 'O+'), 10);
});

test('TC16 Move appointment from pending to completed', async () => {
    const { status } = await api('PATCH', `/appointments/${s.appointmentId}/status`, { token: s.bankA, body: { status: 'completed' } });
    assert.equal(status, 409);
    assert.equal(await units(s.bankAId, 'O+'), 10);
});

test('TC17 Approve and verify a donation', async () => {
    const approve = await api('PATCH', `/appointments/${s.appointmentId}/status`, { token: s.bankA, body: { status: 'approved' } });
    const verify = await api('PATCH', `/appointments/${s.appointmentId}/status`, { token: s.bankA, body: { status: 'completed', volume_ml: 450, screening: SCREENING_OK, blood_type: 'O+' } });
    assert.equal(approve.status, 200);
    assert.equal(verify.status, 200);
    assert.equal(verify.data.classification, 'standard');
    assert.equal(await units(s.bankAId, 'O+'), 11);
    const { data: donations } = await api('GET', '/donations', { token: s.donor });
    assert.equal(donations.length, 1);
});

test('TC18 Donor books again within 90 days', async () => {
    const { status, data } = await api('POST', '/appointments', {
        token: s.donor, body: { blood_bank_id: s.bankAId, appointment_date: addDays(today(), 2), questionnaire: HEALTHY },
    });
    assert.equal(status, 422);
    assert.equal(data.nextEligibleDate, addDays(today(), 90));
});

test('TC19 Approve recipient request for 5 units', async () => {
    const email = `recipient${RUN}@test.local`;
    const reg = await api('POST', '/auth/register', { body: { role: 'recipient', name: 'Test Recipient', email, password: PASSWORD, blood_type: 'O+' } });
    assert.equal(reg.status, 201);
    const res = await login(email, PASSWORD);
    s.recipient = res.data.token;
    s.recipientId = res.data.user.id;

    const req = await api('POST', '/blood-requests', { token: s.recipient, body: { blood_bank_id: s.bankAId, blood_type: 'O+', units: 5, urgency: 'urgent' } });
    assert.equal(req.status, 201);
    const approve = await api('PATCH', `/blood-requests/${req.data.request.id}/status`, { token: s.bankA, body: { status: 'approved' } });
    assert.equal(approve.status, 200);
    assert.equal(await units(s.bankAId, 'O+'), 6);
});

test('TC20 Approve request larger than stock', async () => {
    const req = await api('POST', '/blood-requests', { token: s.recipient, body: { blood_bank_id: s.bankAId, blood_type: 'O+', units: 15 } });
    assert.equal(req.status, 201);
    const approve = await api('PATCH', `/blood-requests/${req.data.request.id}/status`, { token: s.bankA, body: { status: 'approved' } });
    assert.equal(approve.status, 409);
    assert.equal(await units(s.bankAId, 'O+'), 6);
});

test('TC21 Inter-bank transfer of 4 units; wrong bank tries to approve', async () => {
    const req = await api('POST', '/inter-bank-requests', { token: s.bankB, body: { to_bank_id: s.bankAId, blood_type: 'O+', units: 4 } });
    assert.equal(req.status, 201);
    const id = req.data.request.id;

    const wrong = await api('PATCH', `/inter-bank-requests/${id}/status`, { token: s.bankB, body: { status: 'approved' } });
    assert.equal(wrong.status, 403);

    const right = await api('PATCH', `/inter-bank-requests/${id}/status`, { token: s.bankA, body: { status: 'approved' } });
    assert.equal(right.status, 200);
    assert.equal(await units(s.bankAId, 'O+'), 2);
    assert.equal(await units(s.bankBId, 'O+'), 6);
});

test('TC22 Stock falls below 5 units sends a low-stock notification', async () => {
    const { data } = await api('GET', '/notifications', { token: s.bankA });
    assert.ok(data.notifications.some((n) => n.category === 'low_stock' && n.title.includes('O+')));
});

test('TC23 Status notifications to donor and recipient', async () => {
    const donor = await api('GET', '/notifications', { token: s.donor });
    const recipient = await api('GET', '/notifications', { token: s.recipient });
    assert.ok(donor.data.notifications.some((n) => n.category === 'appointment'));
    assert.ok(recipient.data.notifications.some((n) => n.category === 'request'));
});

/* ---------- Collection volume (Recommendation 13) ---------- */

// Registers a second donor and returns an approved appointment at bank A, ready to verify.
async function approvedAppointment() {
    if (!s.donor2) {
        const email = `donor2${RUN}@test.local`;
        await api('POST', '/auth/register', {
            body: { role: 'donor', name: 'Second Donor', email, password: PASSWORD, blood_type: 'O+', date_of_birth: '1994-08-30' },
        });
        const res = await login(email, PASSWORD);
        [s.donor2, s.donor2Id] = [res.data.token, res.data.user.id];
    }
    const book = await api('POST', '/appointments', { token: s.donor2, body: { blood_bank_id: s.bankAId, appointment_date: addDays(today(), 1), questionnaire: HEALTHY } });
    assert.equal(book.status, 201);
    const id = book.data.appointment.id;
    await api('PATCH', `/appointments/${id}/status`, { token: s.bankA, body: { status: 'approved' } });
    return id;
}

test('TC24 Volume above 495 mL or missing is refused', async () => {
    s.appointment2Id = await approvedAppointment();
    const before = await units(s.bankAId, 'O+');
    const over = await api('PATCH', `/appointments/${s.appointment2Id}/status`, { token: s.bankA, body: { status: 'completed', volume_ml: 600, screening: SCREENING_OK } });
    const missing = await api('PATCH', `/appointments/${s.appointment2Id}/status`, { token: s.bankA, body: { status: 'completed', screening: SCREENING_OK } });
    assert.equal(over.status, 400);
    assert.equal(missing.status, 400);
    assert.equal(await units(s.bankAId, 'O+'), before);
});

test('TC25 Incomplete collection (250 mL) is not added to stock', async () => {
    const before = await units(s.bankAId, 'O+');
    const res = await api('PATCH', `/appointments/${s.appointment2Id}/status`, { token: s.bankA, body: { status: 'completed', volume_ml: 250, screening: SCREENING_OK } });
    assert.equal(res.status, 200);
    assert.equal(res.data.classification, 'incomplete');
    assert.equal(res.data.appointment.status, 'rejected');
    assert.equal(await units(s.bankAId, 'O+'), before);
    const { data: donations } = await api('GET', '/donations', { token: s.donor2 });
    assert.equal(donations.length, 0);
});

test('TC26 Low-volume collection (350 mL) is added to stock and marked red cells only', async () => {
    const id = await approvedAppointment(); // the donor may book again after an incomplete collection
    const before = await units(s.bankAId, 'O+');
    const res = await api('PATCH', `/appointments/${id}/status`, { token: s.bankA, body: { status: 'completed', volume_ml: 350, screening: SCREENING_OK } });
    assert.equal(res.status, 200);
    assert.equal(res.data.classification, 'low_volume');
    assert.equal(await units(s.bankAId, 'O+'), before + 1);
    const { data: donations } = await api('GET', '/donations', { token: s.donor2 });
    assert.equal(donations[0].classification, 'low_volume');
    assert.equal(donations[0].volume_ml, 350);
});

/* ---------- Real-time notifications (Recommendation 4) ---------- */

test('TC27 Notification arrives over the event stream within 3 seconds', async () => {
    const controller = new AbortController();
    const res = await fetch(`${BASE}/notifications/stream`, {
        headers: { Authorization: `Bearer ${s.donor}` }, signal: controller.signal,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    const received = (async () => {
        let text = '';
        while (!text.includes('event: notification')) {
            const { value, done } = await reader.read();
            if (done) break;
            text += value;
        }
        return text;
    })();

    const started = Date.now();
    const send = await api('POST', '/notifications', {
        token: s.admin, body: { target: 'users', userIds: [s.donorId], title: 'Live test', message: 'Real-time check' },
    });
    assert.equal(send.status, 201);

    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No event within 3 s')), 3000); });
    try {
        const text = await Promise.race([received, timeout]);
        assert.match(text, /event: notification/);
        assert.ok(Date.now() - started < 3000);
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
});

test('TC28 Event stream refuses a request without a token', async () => {
    const res = await fetch(`${BASE}/notifications/stream`);
    assert.equal(res.status, 401);
    await res.body?.cancel();
});

/* ---------- Swahili and English (Recommendation 2) ---------- */

test('TC29 Error messages follow the Accept-Language header', async () => {
    const english = await api('POST', '/auth/login', { body: { email: s.donorEmail, password: 'WrongPass999' }, lang: 'en' });
    const swahili = await api('POST', '/auth/login', { body: { email: s.donorEmail, password: 'WrongPass999' }, lang: 'sw-TZ' });
    assert.equal(english.data.error, 'Invalid email or password');
    assert.equal(swahili.data.error, 'Barua pepe au nenosiri si sahihi');
});

test('TC30 The same notification is shown in each reader’s language', async () => {
    const english = await api('GET', '/notifications', { token: s.bankA, lang: 'en' });
    const swahili = await api('GET', '/notifications', { token: s.bankA, lang: 'sw' });
    assert.ok(english.data.notifications.some((n) => n.title === 'Low stock: O+'));
    assert.ok(swahili.data.notifications.some((n) => n.title === 'Akiba ndogo: O+'));
});

/* ---------- Donors who need blood ---------- */

const requestBlood = (token, urgency) => api('POST', '/blood-requests', {
    token, body: { blood_bank_id: s.bankAId, blood_type: 'O+', units: 1, urgency },
});

test('TC31 A donor requests blood from the same account', async () => {
    s.recipientUrgent = (await requestBlood(s.recipient, 'urgent')).data.request.id; // older, non-donor
    const res = await requestBlood(s.donor, 'urgent');
    assert.equal(res.status, 201);
    s.donorUrgent = res.data.request.id;
    const { data } = await api('GET', '/blood-requests', { token: s.donor });
    assert.deepEqual(data.map((r) => r.id), [s.donorUrgent]);
});

test('TC32 Donor priority applies only within the same urgency', async () => {
    s.recipientCritical = (await requestBlood(s.recipient, 'critical')).data.request.id; // newest, non-donor
    const { data } = await api('GET', '/blood-requests', { token: s.bankA });
    const order = data.map((r) => r.id).filter((id) => [s.recipientUrgent, s.donorUrgent, s.recipientCritical].includes(id));
    // Critical first even from a non-donor; among urgent ones the donor's newer request beats the older one.
    assert.deepEqual(order, [s.recipientCritical, s.donorUrgent, s.recipientUrgent]);
    assert.ok(data.find((r) => r.id === s.donorUrgent).requester_donations >= 1);
});

/* ---------- Health screening and blood group confirmation ---------- */

async function newDonor(label, bloodType, dateOfBirth, region = null) {
    const email = `${label.toLowerCase().replace(' ', '')}${RUN}@test.local`;
    await api('POST', '/auth/register', {
        body: { role: 'donor', name: label, email, password: PASSWORD, blood_type: bloodType, date_of_birth: dateOfBirth, region },
    });
    const res = await login(email, PASSWORD);
    return res.data.token;
}

const book = (token, extra = {}) => api('POST', '/appointments', {
    token, body: { blood_bank_id: s.bankAId, appointment_date: addDays(today(), 1), questionnaire: HEALTHY, ...extra },
});

test('TC33 Booking is refused when the health questionnaire shows a reason not to donate', async () => {
    s.donor3 = await newDonor('Third Donor', 'O+', '1992-01-15');
    const unanswered = await book(s.donor3, { questionnaire: undefined });
    const ill = await book(s.donor3, { questionnaire: { ...HEALTHY, recent_illness: true } });
    assert.equal(unanswered.status, 400);
    assert.equal(ill.status, 422);
    assert.equal(ill.data.failedQuestions[0].id, 'recent_illness');
    assert.ok(ill.data.failedQuestions[0].advice.length > 0);
    const { data } = await api('GET', '/appointments', { token: s.donor3 });
    assert.equal(data.length, 0);
});

test('TC34 A health check outside the limits blocks collection', async () => {
    const booked = await book(s.donor3);
    assert.equal(booked.status, 201);
    s.appointment3Id = booked.data.appointment.id;
    await api('PATCH', `/appointments/${s.appointment3Id}/status`, { token: s.bankA, body: { status: 'approved' } });
    const before = await units(s.bankAId, 'O+');

    const noCheck = await api('PATCH', `/appointments/${s.appointment3Id}/status`, { token: s.bankA, body: { status: 'completed', volume_ml: 450 } });
    const lowHb = await api('PATCH', `/appointments/${s.appointment3Id}/status`, {
        token: s.bankA, body: { status: 'completed', volume_ml: 450, screening: { ...SCREENING_OK, hemoglobin_g_dl: 11.8 } },
    });
    assert.equal(noCheck.status, 400);
    assert.equal(lowHb.status, 422);
    assert.deepEqual(lowHb.data.failedChecks, ['low_hemoglobin']);
    assert.equal(await units(s.bankAId, 'O+'), before);
});

test('TC35 A deferred donor cannot book until the deferral ends', async () => {
    const defer = await api('PATCH', `/appointments/${s.appointment3Id}/status`, {
        token: s.bankA,
        body: { status: 'deferred', reason: 'low_hemoglobin', deferral_days: 28, screening: { ...SCREENING_OK, hemoglobin_g_dl: 11.8 } },
    });
    assert.equal(defer.status, 200);
    assert.equal(defer.data.appointment.status, 'deferred');

    const again = await book(s.donor3);
    assert.equal(again.status, 422);
    assert.equal(again.data.nextEligibleDate, addDays(today(), 28));

    const { data: eligibility } = await api('GET', '/appointments/eligibility', { token: s.donor3 });
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.deferral.reason, 'low_hemoglobin');
    const { data: notes } = await api('GET', '/notifications', { token: s.donor3 });
    assert.ok(notes.notifications.some((n) => n.title === 'Donation deferred'));
});

test('TC36 The blood bank confirms the donor’s blood group', async () => {
    const donor4 = await newDonor('Fourth Donor', 'A+', '1990-05-05');
    const { data: before } = await api('GET', '/auth/me', { token: donor4 });
    assert.equal(before.user.blood_type_confirmed_at, null);
    const stockBefore = await units(s.bankAId, 'A-');

    const booked = await book(donor4);
    const id = booked.data.appointment.id;
    await api('PATCH', `/appointments/${id}/status`, { token: s.bankA, body: { status: 'approved' } });
    const done = await api('PATCH', `/appointments/${id}/status`, {
        token: s.bankA, body: { status: 'completed', volume_ml: 450, screening: SCREENING_OK, blood_type: 'A-' },
    });
    assert.equal(done.status, 200);

    const { data: after } = await api('GET', '/auth/me', { token: donor4 });
    assert.equal(after.user.blood_type, 'A-');
    assert.ok(after.user.blood_type_confirmed_at);
    assert.equal(after.user.blood_type_confirmed_by_name, 'Test Bank A');
    assert.equal(await units(s.bankAId, 'A-'), stockBefore + 1);

    const change = await api('PUT', '/auth/me', { token: donor4, body: { blood_type: 'A+' } });
    assert.equal(change.status, 400);
    const { data: notes } = await api('GET', '/notifications', { token: donor4 });
    assert.ok(notes.notifications.some((n) => n.title === 'Blood group corrected'));
});

/* ---------- Donor appeals ---------- */

test('TC37 An appeal reaches only eligible donors of the group in the bank’s region', async () => {
    s.donor5 = await newDonor('Fifth Donor', 'B-', '1993-03-03', 'Dodoma'); // same region as Test Bank A
    s.donor6 = await newDonor('Sixth Donor', 'B-', '1993-03-03', 'Mwanza');
    const res = await api('POST', '/appeals', { token: s.bankA, body: { blood_type: 'B-', days: 2, message: 'Theatre needs B-' } });
    assert.equal(res.status, 201);
    assert.ok(res.data.targeted >= 1);
    s.appealId = res.data.appeal.id;

    const five = await api('GET', '/appeals', { token: s.donor5 });
    const six = await api('GET', '/appeals', { token: s.donor6 });
    assert.deepEqual(five.data.map((a) => a.id), [s.appealId]);
    assert.equal(six.data.length, 0);
    const { data: notes } = await api('GET', '/notifications', { token: s.donor5 });
    assert.ok(notes.notifications.some((n) => n.category === 'appeal' && n.title.includes('B-')));

    const duplicate = await api('POST', '/appeals', { token: s.bankA, body: { blood_type: 'B-' } });
    assert.equal(duplicate.status, 409);
});

test('TC38 A donor books from the appeal and the bank sees the response', async () => {
    const booked = await book(s.donor5, { appeal_id: s.appealId });
    assert.equal(booked.status, 201);
    assert.equal(booked.data.appointment.appeal_id, s.appealId);

    const notRecipient = await book(s.donor6, { appeal_id: s.appealId });
    assert.equal(notRecipient.status, 400);

    const { data } = await api('GET', '/appeals', { token: s.bankA });
    const appeal = data.find((a) => a.id === s.appealId);
    assert.equal(appeal.booked, 1);
    assert.equal(appeal.is_active, true);

    const close = await api('PATCH', `/appeals/${s.appealId}/close`, { token: s.bankA });
    assert.equal(close.status, 200);
    const after = await api('GET', '/appeals', { token: s.donor5 });
    assert.equal(after.data.length, 0);
});

/* ---------- Donor card, badges and reminders ---------- */

test('TC39 The donor card shows number, confirmed group, donations and badges', async () => {
    const { data } = await api('GET', '/donors/card', { token: s.donor });
    assert.match(data.donorNumber, /^OBBS-D-\d{6}$/);
    assert.equal(data.blood_type, 'O+');
    assert.ok(data.blood_type_confirmed_at);
    assert.equal(data.donations, 1);
    assert.equal(data.badge.id, 'first');
    assert.deepEqual([data.next_badge.id, data.next_badge.remaining], ['bronze', 4]);
    assert.equal(data.next_eligible_date, addDays(today(), 90));
    const { data: notes } = await api('GET', '/notifications', { token: s.donor });
    assert.ok(notes.notifications.some((n) => n.category === 'badge'));

    const { data: deferred } = await api('GET', '/donors/card', { token: s.donor3 });
    assert.equal(deferred.badge, null);
    assert.equal(deferred.deferred, true);
});

test('TC40 A reminder is sent once when 90 days have passed since the last donation', async () => {
    // Move the donor's only donation 91 days into the past.
    await query('UPDATE donations SET donation_date = ? WHERE donor_id = (SELECT id FROM users WHERE email = ?)',
        [addDays(today(), -91), s.donorEmail]);
    const first = await api('POST', '/reports/reminders', { token: s.admin });
    await api('POST', '/reports/reminders', { token: s.admin });
    assert.equal(first.status, 200);
    assert.ok(first.data.sent >= 1);
    const { data } = await api('GET', '/notifications', { token: s.donor });
    assert.equal(data.notifications.filter((n) => n.category === 'reminder').length, 1);
    const denied = await api('POST', '/reports/reminders', { token: s.donor });
    assert.equal(denied.status, 403);
});

/* ---------- Bag-by-bag stock and expiry (Recommendation 7) ---------- */

const bags = async (token, query = '') => (await api('GET', `/stock/units${query}`, { token })).data;
const receive = (token, blood_type, daysAgo) => api('POST', '/stock', {
    token, body: { blood_type, units: 1, collected_on: addDays(today(), -daysAgo) },
});

test('TC41 Each bag has its own number and expiry date; stock equals the usable bags', async () => {
    const list = await bags(s.bankA, '?bloodType=O%2B');
    assert.equal(list.length, await units(s.bankAId, 'O+'));
    for (const bag of list) {
        assert.match(bag.unit_number, /^OBBS-U-\d{6}$/);
        assert.equal(bag.expiry_date, addDays(bag.collected_on, 35));
    }
    const fromDonation = list.find((b) => b.donor_name === 'Test Donor');
    assert.equal(fromDonation.source, 'donation');
    assert.equal(list.find((b) => b.donor_name === 'Second Donor').classification, 'low_volume');

    const expired = await receive(s.bankA, 'O+', 40);
    const future = await receive(s.bankA, 'O+', -1);
    assert.equal(expired.status, 400);
    assert.equal(future.status, 400);
    const denied = await api('GET', '/stock/units', { token: s.donor });
    assert.equal(denied.status, 403);
});

test('TC42 The bag that expires first is issued first and recorded on the request', async () => {
    for (const daysAgo of [2, 30, 10]) assert.equal((await receive(s.bankB, 'AB-', daysAgo)).status, 201);
    const oldest = (await bags(s.bankB, '?bloodType=AB-'))[0];
    assert.equal(oldest.collected_on, addDays(today(), -30));
    assert.equal(oldest.state, 'ok');

    const req = await api('POST', '/blood-requests', { token: s.recipient, body: { blood_bank_id: s.bankBId, blood_type: 'AB-', units: 1 } });
    const approve = await api('PATCH', `/blood-requests/${req.data.request.id}/status`, { token: s.bankB, body: { status: 'approved' } });
    assert.equal(approve.status, 200);
    assert.equal(await units(s.bankBId, 'AB-'), 2);

    const { data: requests } = await api('GET', '/blood-requests', { token: s.bankB });
    assert.deepEqual(requests.find((r) => r.id === req.data.request.id).unit_numbers, [oldest.unit_number]);
    const issued = await bags(s.bankB, '?status=issued');
    assert.equal(issued.find((b) => b.id === oldest.id).issued_to, 'Test Recipient');
});

test('TC43 An inter-bank transfer moves the bags themselves', async () => {
    const next = (await bags(s.bankB, '?bloodType=AB-'))[0]; // collected 10 days ago
    const req = await api('POST', '/inter-bank-requests', { token: s.bankA, body: { to_bank_id: s.bankBId, blood_type: 'AB-', units: 1 } });
    const supply = await api('PATCH', `/inter-bank-requests/${req.data.request.id}/status`, { token: s.bankB, body: { status: 'approved' } });
    assert.equal(supply.status, 200);

    const moved = (await bags(s.bankA, '?bloodType=AB-')).find((b) => b.id === next.id);
    assert.equal(moved.unit_number, next.unit_number);
    assert.equal(moved.expiry_date, next.expiry_date);
    assert.equal(moved.transferred_from, 'Test Bank B');
    assert.equal(await units(s.bankAId, 'AB-'), 1);
    assert.equal(await units(s.bankBId, 'AB-'), 1);
    s.movedBagId = next.id;
});

test('TC44 Expired bags leave stock and are never issued; banks are warned before expiry', async () => {
    const [lastAtB] = await bags(s.bankB, '?bloodType=AB-');
    await query('UPDATE blood_units SET expiry_date = ? WHERE id = ?', [addDays(today(), -1), s.movedBagId]);
    await query('UPDATE blood_units SET expiry_date = ? WHERE id = ?', [addDays(today(), 2), lastAtB.id]);

    const req = await api('POST', '/blood-requests', { token: s.recipient, body: { blood_bank_id: s.bankAId, blood_type: 'AB-', units: 1 } });
    const approve = await api('PATCH', `/blood-requests/${req.data.request.id}/status`, { token: s.bankA, body: { status: 'approved' } });
    assert.equal(approve.status, 409);
    s.refusedRequestId = req.data.request.id;

    const check = await api('POST', '/reports/expiry-check', { token: s.admin });
    await api('POST', '/reports/expiry-check', { token: s.admin });
    assert.equal(check.status, 200);
    assert.ok(check.data.expired >= 1);
    assert.equal(await units(s.bankAId, 'AB-'), 0);
    assert.equal((await bags(s.bankA, '?status=expired')).find((b) => b.id === s.movedBagId).status, 'expired');

    const notesA = (await api('GET', '/notifications', { token: s.bankA })).data.notifications;
    const notesB = (await api('GET', '/notifications', { token: s.bankB })).data.notifications;
    assert.ok(notesA.some((n) => n.category === 'expiry' && n.title === 'Expired blood removed: AB-'));
    assert.equal(notesB.filter((n) => n.title === 'Blood expiring soon: AB-').length, 1);
    assert.equal((await bags(s.bankB, '?bloodType=AB-'))[0].state, 'expiring');
});

test('TC45 Only the holding bank can discard a bag, with a reason; donors hear when their blood is used', async () => {
    const before = await units(s.bankAId, 'O+');
    const received = (await bags(s.bankA, '?bloodType=O%2B')).find((b) => b.source === 'received');
    const url = `/stock/units/${received.id}/discard`;
    assert.equal((await api('PATCH', url, { token: s.bankA, body: {} })).status, 400);
    assert.equal((await api('PATCH', url, { token: s.bankA, body: { reason: 'other' } })).status, 400);
    assert.equal((await api('PATCH', url, { token: s.bankB, body: { reason: 'damaged' } })).status, 404);
    assert.equal((await api('PATCH', url, { token: s.bankA, body: { reason: 'damaged' } })).status, 200);
    assert.equal((await api('PATCH', url, { token: s.bankA, body: { reason: 'damaged' } })).status, 409);
    assert.equal(await units(s.bankAId, 'O+'), before - 1);

    // The next O+ bag at bank A is the one from Test Donor's donation (TC17).
    const approve = await api('PATCH', `/blood-requests/${s.recipientCritical}/status`, { token: s.bankA, body: { status: 'approved' } });
    assert.equal(approve.status, 200);
    const { data: donations } = await api('GET', '/donations', { token: s.donor });
    assert.equal(donations[0].unit_status, 'issued');
    const { data } = await api('GET', '/notifications', { token: s.donor });
    assert.ok(data.notifications.some((n) => n.category === 'donation_used'));
});

/* ---------- Audit log ---------- */

const auditLog = async (query = '', token = s.admin, lang) => api('GET', `/audit${query}`, { token, lang });

test('TC46 Important actions are recorded with who did them, to whom and when', async () => {
    const { status, data } = await auditLog(`?userId=${s.bankAId}`);
    assert.equal(status, 200);
    const find = (action) => data.entries.find((e) => e.action === action);
    const approval = find('user.status');
    assert.equal(approval.actor_role, 'admin');
    assert.equal(approval.subject_name, 'Test Bank A');
    assert.ok(approval.created_at);

    const verified = data.entries.find((e) => e.action === 'donation.verified' && e.subject_name === 'Test Donor');
    assert.equal(verified.actor_name, 'Test Bank A');
    assert.match(verified.summary, /^Verified a donation from Test Donor: 450 mL of O\+, bag OBBS-U-\d{6}$/);
    assert.match(find('request.approved').summary, /bags OBBS-U-\d{6}/);
    assert.equal(find('stock.discarded').summary.includes('Bag damaged or leaking'), true);
    assert.equal(find('transfer.approved').actor_name, 'Test Bank B');
});

test('TC47 Failed and refused logins are recorded; work that was rolled back is not', async () => {
    const { data } = await auditLog(`?category=accounts&search=${encodeURIComponent(s.donorEmail)}`);
    assert.ok(data.entries.some((e) => e.action === 'auth.login_failed' && e.subject_name === 'Test Donor' && e.actor_id === null));
    const blocked = await auditLog(`?userId=${s.bankAId}&category=accounts`);
    assert.ok(blocked.data.entries.some((e) => e.action === 'auth.login_blocked'));

    const swahili = await auditLog(`?category=accounts&search=${encodeURIComponent(s.donorEmail)}`, s.admin, 'sw');
    assert.ok(swahili.data.entries.some((e) => e.summary === `Jaribio la kuingia lililoshindwa kwa ${s.donorEmail}`));

    // The refused approval in TC44 (expired bag) left no 'approved' entry and no second expiry entry.
    const { data: bankA } = await auditLog(`?userId=${s.bankAId}&category=requests`);
    assert.equal(bankA.entries.filter((e) => e.entity_id === s.refusedRequestId && e.action === 'request.approved').length, 0);
    const { data: stock } = await auditLog(`?category=stock&search=${encodeURIComponent('Test Bank A')}`);
    assert.equal(stock.entries.filter((e) => e.action === 'stock.expired').length, 1);
});

test('TC48 Only the manager can read the audit log; filters and pages work', async () => {
    assert.equal((await auditLog('', s.bankA)).status, 403);
    assert.equal((await auditLog('', s.donor)).status, 403);
    assert.equal((await auditLog('?category=nothing')).status, 400);

    const { data: stock } = await auditLog('?category=stock');
    assert.ok(stock.entries.length > 0);
    assert.ok(stock.entries.every((e) => e.category === 'stock'));

    const { data: first } = await auditLog();
    assert.ok(first.entries.length <= 50);
    if (first.next) {
        const { data: second } = await auditLog(`?before=${first.next}`);
        assert.ok(second.entries.every((e) => e.id < first.next));
    }
});

/* ---------- Forgotten password ---------- */

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const resetLink = (userId, token, minutes) => query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
    [userId, sha256(token), minutes]);

test('TC49 A reset request gets the same answer for any email and stores only a hash of the link', async () => {
    const known = await api('POST', '/auth/forgot-password', { body: { email: s.donorEmail } });
    const unknown = await api('POST', '/auth/forgot-password', { body: { email: `nobody${RUN}@test.local` } });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.equal(known.data.message, unknown.data.message);
    assert.equal((await api('POST', '/auth/forgot-password', { body: { email: 'not-an-email' } })).status, 400);

    let rows = [];
    for (let i = 0; i < 20 && !rows.length; i += 1) {
        await new Promise((r) => setTimeout(r, 100)); // the link is created after the reply
        rows = await query('SELECT token_hash, TIMESTAMPDIFF(MINUTE, NOW(), expires_at) AS minutes FROM password_resets WHERE user_id = ?', [s.donorId]);
    }
    assert.equal(rows.length, 1);
    assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
    assert.ok(rows[0].minutes >= 29 && rows[0].minutes <= 30);

    await api('POST', '/auth/forgot-password', { body: { email: s.donorEmail } }); // within 2 minutes: no second link
    await new Promise((r) => setTimeout(r, 300));
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?', [s.donorId]);
    assert.equal(Number(n), 1);
});

test('TC50 A valid link sets the new password once and ends the sessions opened before', async () => {
    const token = `reset-${RUN}`;
    await resetLink(s.recipientId, token, 30);
    assert.equal((await api('GET', '/auth/me', { token: s.recipient })).status, 200);

    const weak = await api('POST', '/auth/reset-password', { body: { token, password: '123' } });
    assert.equal(weak.status, 400);
    const reset = await api('POST', '/auth/reset-password', { body: { token, password: 'Fresh5678pass' } });
    assert.equal(reset.status, 200);

    assert.equal((await api('GET', '/auth/me', { token: s.recipient })).status, 401);
    const email = `recipient${RUN}@test.local`;
    assert.equal((await login(email, PASSWORD)).status, 401);
    const fresh = await login(email, 'Fresh5678pass');
    assert.equal(fresh.status, 200);
    assert.equal((await api('POST', '/auth/reset-password', { body: { token, password: 'Other5678pass' } })).status, 400);

    const { data } = await api('GET', '/notifications', { token: fresh.data.token });
    assert.ok(data.notifications.some((n) => n.category === 'security'));
    const { data: log } = await api('GET', `/audit?userId=${s.recipientId}&category=accounts`, { token: s.admin });
    assert.ok(log.entries.some((e) => e.action === 'auth.password_reset' && e.actor_name === 'Test Recipient'));
});

test('TC51 Expired and unknown links are refused; a profile password change keeps only the current session', async () => {
    await resetLink(s.donorId, `expired-${RUN}`, -1);
    assert.equal((await api('POST', '/auth/reset-password', { body: { token: `expired-${RUN}`, password: 'Fresh5678pass' } })).status, 400);
    assert.equal((await api('POST', '/auth/reset-password', { body: { token: 'no-such-link', password: 'Fresh5678pass' } })).status, 400);

    await new Promise((r) => setTimeout(r, 1100)); // the old session must be at least a second older
    const current = (await login(s.donorEmail, PASSWORD)).data.token;
    const change = await api('PUT', '/auth/me', { token: current, body: { currentPassword: PASSWORD, newPassword: 'Changed5678pass' } });
    assert.equal(change.status, 200);
    assert.ok(change.data.token);
    assert.equal((await api('GET', '/auth/me', { token: change.data.token })).status, 200);
    assert.equal((await api('GET', '/auth/me', { token: s.donor })).status, 401);
});

/* ---------- Statistics (Recommendation 2) ---------- */

test('TC52 The manager gets month-by-month figures that match the recorded activity', async () => {
    // Test Bank A since the month TC40 moved Test Donor's donation into.
    const from = addDays(today(), -91).slice(0, 7);
    const to = today().slice(0, 7);
    const { status, data } = await api('GET', `/reports/trends?from=${from}&to=${to}&bankId=${s.bankAId}`, { token: s.admin });
    assert.equal(status, 200);
    assert.equal(data.donations.length, data.requests.length);
    assert.equal(data.donations.at(-1).month, to);
    assert.equal(data.totals.donations, 3); // TC17, TC26 (low volume) and TC36
    assert.equal(data.donations.at(-1).low_volume, 1);
    assert.equal(data.totals.requests, 6);
    assert.equal(data.totals.approval_rate, 100); // TC19 and TC45 approved, the rest still pending
    assert.deepEqual([data.totals.issued_bags, data.totals.wasted_bags, data.totals.wastage_rate], [6, 2, 25]);
    assert.ok(data.totals.avg_response_hours !== null);
    const oPos = data.groups.find((g) => g.blood_type === 'O+');
    assert.deepEqual([oPos.requested, oPos.issued], [23, 6]);
    assert.equal(data.supply.find((g) => g.blood_type === 'O+').units, await units(s.bankAId, 'O+'));

    assert.equal((await api('GET', `/reports/trends?from=${to}&to=${from}`, { token: s.admin })).status, 400);
    assert.equal((await api('GET', '/reports/trends?from=2020-01&to=2026-01', { token: s.admin })).status, 400);
    assert.equal((await api('GET', '/reports/trends', { token: s.bankA })).status, 403);
});

/* ---------- Email copies of notifications ---------- */

test('TC53 Users choose whether notifications are also emailed; emails follow the language they use', async () => {
    const email = `mail${RUN}@test.local`;
    const reg = await api('POST', '/auth/register', { lang: 'sw', body: { role: 'recipient', name: 'Mail Test', email, password: PASSWORD } });
    assert.equal(reg.status, 201);
    assert.deepEqual([reg.data.user.language, reg.data.user.email_notifications], ['sw', true]);

    const token = (await login(email, PASSWORD)).data.token; // logs in without Swahili: emails switch to English
    assert.equal((await api('GET', '/auth/me', { token })).data.user.language, 'en');
    const off = await api('PUT', '/auth/me', { token, body: { email_notifications: false, language: 'sw' } });
    assert.equal(off.status, 200);
    assert.deepEqual([off.data.user.email_notifications, off.data.user.language], [false, 'sw']);
    assert.equal((await api('PUT', '/auth/me', { token, body: { language: 'fr' } })).status, 400);

    // Other users learn only whether email is set up, not the manager's figures.
    const status = await api('GET', '/notifications/email', { token });
    assert.equal(status.status, 200);
    assert.deepEqual(Object.keys(status.data), ['configured']);
    s.mailUser = { id: reg.data.user.id, token };
});

test('TC54 Mail to demo and test addresses is never sent; only the manager checks the email account', async () => {
    const sent = await api('POST', '/notifications', {
        token: s.admin, body: { target: 'users', userIds: [s.mailUser.id], title: `Email ${RUN}`, message: 'By email', method: 'email' },
    });
    assert.equal(sent.status, 201);
    const { data } = await api('GET', '/notifications', { token: s.mailUser.token });
    assert.equal(data.notifications.find((n) => n.title === `Email ${RUN}`).email_status, null);

    const status = await api('GET', '/notifications/email', { token: s.admin });
    assert.deepEqual(Object.keys(status.data).sort(), ['configured', 'failed', 'from', 'pending', 'sent']);
    assert.equal((await api('POST', '/notifications/email/test', { token: s.admin, body: { to: 'not-an-email' } })).status, 400);
    assert.equal((await api('POST', '/notifications/email/test', { token: s.admin, body: { to: `x${RUN}@test.local` } })).status, 400);
    assert.equal((await api('POST', '/notifications/email/test', { token: s.mailUser.token, body: { to: 'someone@gmail.com' } })).status, 403);
});

/* ---------- Home page ---------- */

test('TC55 The home page figures need no login, contain counts only and no blood stock', async () => {
    const { status, data } = await api('GET', '/public/summary');
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(data).sort(), ['banks', 'campaigns', 'donations', 'donors']);
    for (const key of Object.keys(data)) assert.ok(Number.isInteger(data[key]) && data[key] >= 0, key);
});

/* ---------- Delivery of approved requests ---------- */

async function approvedRequestFromDonor2() {
    await api('POST', '/stock', { token: s.bankA, body: { blood_type: 'O+', units: 1 } });
    const req = await api('POST', '/blood-requests', { token: s.donor2, body: { blood_bank_id: s.bankAId, blood_type: 'O+', units: 1, urgency: 'urgent' } });
    const approve = await api('PATCH', `/blood-requests/${req.data.request.id}/status`, { token: s.bankA, body: { status: 'approved' } });
    assert.equal(approve.status, 200);
    assert.equal(approve.data.request.delivery_status, 'preparing');
    assert.ok(approve.data.request.decided_at);
    return req.data.request.id;
}
const step = (token, id, body) => api('PATCH', `/blood-requests/${id}/delivery`, { token, body });

test('TC56 The bank makes the blood ready and the requester confirms receipt', async () => {
    const id = await approvedRequestFromDonor2();
    assert.equal((await step(s.donor2, id, { step: 'ready' })).status, 403);
    assert.equal((await step(s.donor2, id, { step: 'received' })).status, 409); // still being prepared

    const ready = await step(s.bankA, id, { step: 'ready' });
    assert.equal(ready.status, 200);
    assert.ok(ready.data.request.ready_at);
    const { data: notes } = await api('GET', '/notifications', { token: s.donor2 });
    assert.ok(notes.notifications.some((n) => n.title === 'Blood ready for collection'));

    const received = await step(s.donor2, id, { step: 'received' });
    assert.equal(received.status, 200);
    assert.equal(received.data.request.delivery_status, 'received');
    assert.equal(received.data.request.received_confirmed_by, 'recipient');
    assert.equal((await step(s.donor2, id, { step: 'received' })).status, 409);
    const { data: bankNotes } = await api('GET', '/notifications', { token: s.bankA });
    assert.ok(bankNotes.notifications.some((n) => n.title === 'Blood received'));
    const { data: log } = await api('GET', `/audit?userId=${s.donor2Id}&category=requests`, { token: s.admin });
    assert.ok(log.entries.some((e) => e.action === 'request.received' && e.actor_name === 'Second Donor'));
});

test('TC57 Sending with a courier needs the courier details; only the supplying bank records steps', async () => {
    const id = await approvedRequestFromDonor2();
    assert.equal((await step(s.bankB, id, { step: 'ready' })).status, 403);
    assert.equal((await step(s.bankA, id, { step: 'dispatched' })).status, 400);
    const sent = await step(s.bankA, id, { step: 'dispatched', courier_name: 'Test Courier', courier_phone: '0700 000 111' });
    assert.equal(sent.status, 200);
    assert.ok(sent.data.request.dispatched_at);
    assert.equal((await step(s.bankA, id, { step: 'ready' })).status, 409);
    const { data: notes } = await api('GET', '/notifications', { token: s.donor2 });
    assert.ok(notes.notifications.some((n) => n.title === 'Blood on the way' && n.message.includes('Test Courier')));

    const delivered = await step(s.bankA, id, { step: 'received' });
    assert.equal(delivered.data.request.received_confirmed_by, 'bank');
    const { data: mine } = await api('GET', '/blood-requests', { token: s.donor2 });
    assert.equal(mine.find((r) => r.id === id).courier_phone, '0700 000 111');

    const month = today().slice(0, 7);
    const { data: trends } = await api('GET', `/reports/trends?from=${month}&to=${month}&bankId=${s.bankAId}`, { token: s.admin });
    assert.ok(trends.totals.received >= 2);
    assert.ok(trends.totals.avg_delivery_hours !== null);
});

/* ---------- Blood donation campaigns ---------- */

// A region with no demo donors, so the invitations go only to the test donors.
const CAMPAIGN_REGION = 'Test Region';
const createCampaign = (token, extra = {}) => api('POST', '/campaigns', {
    token,
    body: { title: 'Test Drive', venue: 'Test School Hall', region: CAMPAIGN_REGION, campaign_date: addDays(today(), 7), start_time: '08:00', end_time: '14:00', target_units: 40, ...extra },
});

test('TC58 A bank creates a campaign and eligible donors of the region are invited', async () => {
    s.donor7 = await newDonor('Seventh Donor', 'O+', '1991-02-02', CAMPAIGN_REGION);
    assert.equal((await createCampaign(s.bankA, { title: '' })).status, 400);
    assert.equal((await createCampaign(s.bankA, { campaign_date: addDays(today(), -1) })).status, 400);
    assert.equal((await createCampaign(s.bankA, { start_time: '15:00', end_time: '09:00' })).status, 400);
    assert.equal((await createCampaign(s.bankA, { target_units: 0 })).status, 400);
    assert.equal((await createCampaign(s.donor7)).status, 403);

    const res = await createCampaign(s.bankA);
    assert.equal(res.status, 201);
    assert.equal(res.data.invited, 1);
    assert.equal(res.data.campaign.state, 'upcoming');
    s.campaignId = res.data.campaign.id;
    const { data } = await api('GET', '/notifications', { token: s.donor7 });
    assert.ok(data.notifications.some((n) => n.category === 'campaign' && n.title === 'Blood donation campaign: Test Drive'));
});

test('TC59 A donor registers for the campaign; registrations and donations are counted', async () => {
    const { data: list } = await api('GET', '/campaigns', { token: s.donor7 });
    const mine = list.find((c) => c.id === s.campaignId);
    assert.equal(mine.joined, false);

    const booked = await api('POST', '/appointments', { token: s.donor7, body: { campaign_id: s.campaignId, questionnaire: HEALTHY } });
    assert.equal(booked.status, 201);
    assert.equal(booked.data.appointment.status, 'approved');
    assert.equal(booked.data.appointment.appointment_date, addDays(today(), 7));
    assert.equal(booked.data.appointment.blood_bank_id, s.bankAId);
    assert.equal((await api('POST', '/appointments', { token: s.donor7, body: { campaign_id: s.campaignId, questionnaire: HEALTHY } })).status, 409);
    assert.equal((await api('GET', '/campaigns', { token: s.donor7 })).data.find((c) => c.id === s.campaignId).joined, true);

    const { data: appts } = await api('GET', '/appointments', { token: s.bankA });
    assert.equal(appts.find((a) => a.id === booked.data.appointment.id).campaign_title, 'Test Drive');
    const done = await api('PATCH', `/appointments/${booked.data.appointment.id}/status`, {
        token: s.bankA, body: { status: 'completed', volume_ml: 450, screening: SCREENING_OK, blood_type: 'O+' },
    });
    assert.equal(done.status, 200);
    const campaign = (await api('GET', '/campaigns', { token: s.bankA })).data.find((c) => c.id === s.campaignId);
    assert.deepEqual([campaign.registered, campaign.donated, campaign.target_units], [1, 1, 40]);

    const { status, data: open } = await api('GET', '/public/campaigns');
    assert.equal(status, 200);
    assert.ok(open.some((c) => c.id === s.campaignId && c.venue === 'Test School Hall' && c.start_time === '08:00'));
});

test('TC60 Cancelling a campaign closes its registrations and tells the donors', async () => {
    const donor8 = await newDonor('Eighth Donor', 'A+', '1990-06-06', CAMPAIGN_REGION);
    const { data } = await createCampaign(s.bankA, { title: 'Second Drive', campaign_date: addDays(today(), 10) });
    const id = data.campaign.id;
    const booked = await api('POST', '/appointments', { token: donor8, body: { campaign_id: id, questionnaire: HEALTHY } });
    assert.equal(booked.status, 201);

    assert.equal((await api('PATCH', `/campaigns/${id}/cancel`, { token: s.bankB })).status, 403);
    const cancel = await api('PATCH', `/campaigns/${id}/cancel`, { token: s.bankA, body: { reason: 'Venue not available' } });
    assert.equal(cancel.status, 200);
    assert.equal((await api('PATCH', `/campaigns/${id}/cancel`, { token: s.bankA })).status, 409);

    const { data: appts } = await api('GET', '/appointments', { token: donor8 });
    assert.equal(appts[0].status, 'rejected');
    const { data: notes } = await api('GET', '/notifications', { token: donor8 });
    assert.ok(notes.notifications.some((n) => n.title === 'Campaign cancelled: Second Drive' && n.message.includes('Venue not available')));
    assert.equal((await api('POST', '/appointments', { token: donor8, body: { campaign_id: id, questionnaire: HEALTHY } })).status, 400);
    assert.ok(!(await api('GET', '/public/campaigns')).data.some((c) => c.id === id));
});

/* ---------- Blood stock is confidential ---------- */

test('TC61 Only a bank sees its own stock and the manager sees every bank; donors and recipients see none', async () => {
    assert.equal((await api('GET', '/stock', { token: s.donor2 })).status, 403);
    assert.equal((await api('GET', '/stock', { token: s.donor7 })).status, 403);
    const recipient = await api('POST', '/auth/login', { body: { email: `recipient${RUN}@test.local`, password: 'Fresh5678pass' } });
    assert.equal((await api('GET', '/stock', { token: recipient.data.token })).status, 403);
    assert.equal((await api('GET', '/stock/compatible?bloodType=O%2B', { token: recipient.data.token })).status, 404);

    const own = await api('GET', '/stock', { token: s.bankA });
    assert.equal(own.status, 200);
    assert.ok(own.data.length > 0 && own.data.every((r) => r.blood_bank_id === s.bankAId));
    assert.equal((await api('GET', `/stock?bankId=${s.bankBId}`, { token: s.bankA })).status, 403);
    assert.equal((await api('GET', `/stock?bankId=${s.bankAId}`, { token: s.bankA })).status, 200);
    assert.equal((await api('GET', '/stock/units', { token: s.donor2 })).status, 403);

    const all = await api('GET', '/stock', { token: s.admin });
    assert.ok([s.bankAId, s.bankBId].every((id) => all.data.some((r) => r.blood_bank_id === id)));
    const one = await api('GET', `/stock?bankId=${s.bankBId}`, { token: s.admin });
    assert.ok(one.data.every((r) => r.blood_bank_id === s.bankBId));
});
