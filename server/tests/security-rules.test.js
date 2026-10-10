import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sessionSecret } from '../config.js';
import { cleanText, isStrongPassword } from '../utils/validate.js';
import { eventFrame } from '../utils/live.js';
import { telephoneUrl } from '../../shared/urls.js';
import { ensureEnvironment } from '../../scripts/prepare-local.mjs';
import { testDatabaseName } from '../scripts/test-environment.js';
import express from 'express';
import { authLimiter } from '../middleware/security.js';
import { sendMail } from '../utils/mailer.js';

test('Production refuses missing, published and short session secrets', () => {
    for (const value of [undefined, '', 'short', 'dev-only-secret-change-me', 'change-this-to-a-long-random-secret'])
        assert.throws(() => sessionSecret(value, true));
    const secret = randomBytes(32).toString('hex');
    assert.equal(sessionSecret(secret, true), secret);
    assert.notEqual(sessionSecret(undefined, false), sessionSecret(undefined, false));
});

test('Password validation prevents bcrypt byte truncation and supports stronger manager credentials', () => {
    assert.ok(isStrongPassword('Aa1' + 'x'.repeat(69)));
    assert.ok(!isStrongPassword('Aa1' + 'x'.repeat(70)));
    assert.ok(!isStrongPassword('Aa1' + 'é'.repeat(35)));
    assert.ok(!isStrongPassword('Aa1xxxxxx', 12));
});

test('Text fields reject objects with attacker-controlled string conversion', () => {
    for (const value of [{ toString: 'bad' }, {}, [], 42, true]) assert.throws(() => cleanText(value), { status: 400 });
    assert.equal(cleanText(' safe text '), 'safe text');
});

test('Event frames escape markup and preserve JSON without injecting another event', () => {
    const data = { text: '<script>alert(1)</script> & data\n\nevent: fake', unicode: '\u2028' };
    const frame = eventFrame('notification', data);
    assert.ok(!frame.includes('<') && !frame.includes('>') && !frame.includes('&'));
    assert.equal(frame.split('\n').filter((line) => line.startsWith('event:')).length, 1);
    assert.deepEqual(JSON.parse(frame.split('\ndata: ')[1].split('\n\n')[0]), data);
    assert.throws(() => eventFrame('notification\n\nevent:fake', data));
});

test('Telephone links validate numbers and cannot introduce executable URL schemes', () => {
    assert.equal(telephoneUrl('+255712345678'), 'tel:+255712345678');
    assert.equal(telephoneUrl('0712 345 678'), 'tel:+255712345678');
    for (const value of ['javascript:alert(1)', '+255712345678?x=1', {}, undefined]) assert.equal(telephoneUrl(value), '#');
});

test('Local setup generates private credentials and preserves existing environment files', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'obbs-environment-'));
    const example = path.join(folder, 'example.txt'), target = path.join(folder, 'private.txt');
    try {
        await writeFile(example, 'JWT_SECRET=\nADMIN_PASSWORD=\nDB_NAME=obbs\n');
        assert.equal(await ensureEnvironment(example, target), true);
        const first = await readFile(target, 'utf8');
        assert.match(first, /JWT_SECRET=[a-f0-9]{64}/);
        assert.match(first, /ADMIN_PASSWORD=Aa1-[a-f0-9]{48}/);
        assert.equal(await ensureEnvironment(example, target), false);
        assert.equal(await readFile(target, 'utf8'), first);
    } finally { await unlink(example); await unlink(target).catch(() => {}); await rmdir(folder); }
});

test('Test environments reject normal database names', () => {
    assert.throws(() => testDatabaseName('obbs'));
    assert.throws(() => testDatabaseName('obbs_test;DROP DATABASE obbs'));
    assert.match(testDatabaseName(), /^obbs_test_/);
});

test('Both demo seeders refuse production before any database work', () => {
    for (const file of ['seed-demo.js', 'seed-history.js']) {
        const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/' + file, import.meta.url))], {
            env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: randomBytes(32).toString('hex'), DB_PORT: '1' },
            windowsHide: true, encoding: 'utf8', timeout: 10000,
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Demo seeding is disabled in production/);
        assert.ok(!result.stderr.includes('ECONNREFUSED'));
    }
});

test('The auth limiter blocks repeated attempts and returns retry information', async () => {
    const app = express();
    app.get('/attempt', authLimiter({ limit: 2, windowMs: 60000 }), (_req, res) => res.json({ allowed: true }));
    const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    try {
        const url = `http://127.0.0.1:${server.address().port}/attempt`;
        assert.equal((await fetch(url)).status, 200);
        assert.equal((await fetch(url)).status, 200);
        const blocked = await fetch(url);
        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Undeliverable email never logs private content or reset secrets', async () => {
    const originalLog = console.log, logs = [];
    const marker = randomBytes(32).toString('hex');
    console.log = (...values) => logs.push(values.join(' '));
    try {
        assert.equal(await sendMail({ to: 'privacy@test.local', subject: 'Private example', text: marker }), false);
        assert.deepEqual(logs, []);
    } finally { console.log = originalLog; }
});
