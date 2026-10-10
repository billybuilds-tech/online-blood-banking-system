import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool, query } from '../db.js';
import { apiClient } from './http-client.js';
import { testCredential } from './fixtures.js';

if (!/^obbs_test[a-z0-9_]*$/.test(config.db.database)) throw new Error('Security API tests require an obbs_test database.');
const base = process.env.API_URL;
const userEmail = `security-${randomBytes(8).toString('hex')}@test.local`;
const original = 'Aa1' + randomBytes(35).toString('hex').slice(0, 69);
const client = apiClient(() => base, { browser: true });
const manager = apiClient(() => base);
let userId, token, adminToken;

before(async () => {
    const registration = await client('POST', '/auth/register', { body: { role: 'recipient', name: 'Security User', email: userEmail, password: original } });
    assert.equal(registration.status, 201);
    userId = registration.data.user.id;
    const login = await client('POST', '/auth/login', { body: { email: userEmail, password: original } });
    assert.equal(login.status, 200);
    token = login.data.token;
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
    adminToken = (await manager('POST', '/auth/login', { body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } })).data.token;
});
after(async () => { try { await query('DELETE FROM users WHERE id=?', [userId]); } finally { await pool.end(); } });

test('Cookie sessions reload and private replies carry no-store and security headers', async () => {
    const me = await client('GET', '/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.user.id, userId);
    assert.equal(me.data.user.session_version, undefined);
    assert.equal(me.headers.get('cache-control'), 'no-store');
    assert.equal(me.headers.get('x-content-type-options'), 'nosniff');
});

test('Missing/forged CSRF tokens and simple cross-site forms cannot change a browser session', async () => {
    for (const csrf of ['', randomBytes(32).toString('hex')]) {
        const response = await client('POST', '/auth/logout', { headers: { 'X-CSRF-Token': csrf } });
        assert.equal(response.status, 403);
        assert.equal(response.data.code, 'CSRF_TOKEN_INVALID');
    }
    for (const type of ['text/plain', 'application/x-www-form-urlencoded'])
        assert.equal((await client('POST', '/auth/logout', { headers: { 'Content-Type': type } })).status, 415);
    assert.equal((await client('POST', '/auth/logout', { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
    assert.equal((await client('GET', '/auth/me')).status, 200);
});

test('Malformed, non-expiring, expired and alternate-algorithm bearer sessions are refused', async () => {
    const claims = { id: userId, role: 'recipient', version: 0 };
    for (const forged of [
        jwt.sign(claims, config.jwtSecret, { algorithm: 'HS384', expiresIn: '1h' }),
        jwt.sign(claims, config.jwtSecret), jwt.sign(claims, config.jwtSecret, { expiresIn: -1 }),
        jwt.sign({ ...claims, id: {} }, config.jwtSecret, { expiresIn: '1h' }),
        jwt.sign({ ...claims, id: String(userId) }, config.jwtSecret, { expiresIn: '1h' }),
        jwt.sign({ ...claims, version: -1 }, config.jwtSecret, { expiresIn: '1h' }),
    ]) assert.equal((await client('GET', '/auth/me', { token: forged })).status, 401);
});

test('Object text/query input and malformed report months return 400 instead of server errors', async () => {
    assert.equal((await client('PUT', '/auth/me', { body: { name: { toString: 'bad' } } })).status, 400);
    for (const path of ['/users?role=bloodbank&search[x]=bad', '/audit?search=one&search=two',
        '/reports/trends?to[x]=bad', '/reports/trends?to=invalid', '/reports/trends?to=9999-12',
        '/reports/summary?month[toString]=bad', '/audit?category=constructor'])
        assert.equal((await manager('GET', path, { token: adminToken })).status, 400);
});

test('Passwords above bcrypt byte limits are rejected even when their prefix matches', async () => {
    assert.equal((await client('POST', '/auth/login', { body: { email: userEmail, password: original + 'suffix' } })).status, 401);
    assert.equal((await client('PUT', '/auth/me', { body: { currentPassword: original + 'suffix', newPassword: testCredential() } })).status, 400);
    assert.equal((await client('POST', '/auth/reset-password', { body: { token: 'invalid', password: original + 'é' } })).status, 400);
});

test('Password changes revoke same-second bearer sessions and continue the current cookie session', async () => {
    const fresh = testCredential();
    const changed = await client('PUT', '/auth/me', { body: { currentPassword: original, newPassword: fresh } });
    assert.equal(changed.status, 200);
    assert.equal((await client('GET', '/auth/me', { token })).status, 401);
    assert.equal((await client('GET', '/auth/me')).status, 200);
    token = changed.data.token;
});

test('Password resets are one-use and revoke every prior cookie and bearer session', async () => {
    const reset = randomBytes(32).toString('hex');
    await query('INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',
        [userId, createHash('sha256').update(reset).digest('hex')]);
    const fresh = testCredential();
    assert.equal((await client('POST', '/auth/reset-password', { body: { token: reset, password: fresh } })).status, 200);
    assert.equal((await client('GET', '/auth/me', { token })).status, 401);
    assert.equal((await client('GET', '/auth/me')).status, 401);
    assert.equal((await client('POST', '/auth/reset-password', { body: { token: reset, password: fresh } })).status, 400);
    token = (await client('POST', '/auth/login', { body: { email: userEmail, password: fresh } })).data.token;
});

test('Server logout revokes bearer copies and clears the browser cookie', async () => {
    const result = await client('POST', '/auth/logout');
    assert.equal(result.status, 200);
    assert.match(result.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    assert.equal((await client('GET', '/auth/me', { token })).status, 401);
    assert.equal((await client('GET', '/auth/me')).status, 401);
});
