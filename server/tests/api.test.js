/*
 * Black-box API tests TC01-TC23 (Table 5.1).
 * Start the server first (npm start), then run: npm run test:api
 * The Blood Bank Manager account from .env must exist (npm run create-admin).
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import '../config.js';
import { addDays, today } from '../utils/rules.js';

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}/api`;
const ADMIN = {
    email: process.env.ADMIN_EMAIL || 'manager@obbs.local',
    password: process.env.ADMIN_PASSWORD || 'Manager@2026',
};
const RUN = Date.now();
const PASSWORD = 'Test1234pass';
const s = {}; // state shared between the ordered test cases

async function api(method, path, { token, body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, data };
}

const login = (email, password) => api('POST', '/auth/login', { body: { email, password } });

// Remove the accounts this run created; their records go with them (ON DELETE CASCADE).
after(async () => {
    if (!s.admin) return;
    for (const id of [s.donorId, s.recipientId, s.bankAId, s.bankBId].filter(Boolean)) {
        await api('DELETE', `/users/${id}`, { token: s.admin });
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
    const first = await api('POST', '/appointments', { token: s.donor, body: { blood_bank_id: s.bankAId, appointment_date: date } });
    const second = await api('POST', '/appointments', { token: s.donor, body: { blood_bank_id: s.bankAId, appointment_date: date } });
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
    const verify = await api('PATCH', `/appointments/${s.appointmentId}/status`, { token: s.bankA, body: { status: 'completed' } });
    assert.equal(approve.status, 200);
    assert.equal(verify.status, 200);
    assert.equal(await units(s.bankAId, 'O+'), 11);
    const { data: donations } = await api('GET', '/donations', { token: s.donor });
    assert.equal(donations.length, 1);
});

test('TC18 Donor books again within 90 days', async () => {
    const { status, data } = await api('POST', '/appointments', {
        token: s.donor, body: { blood_bank_id: s.bankAId, appointment_date: addDays(today(), 2) },
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
