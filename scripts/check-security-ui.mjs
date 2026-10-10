import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';
import { testEnvironment } from '../server/scripts/test-environment.js';
import { apiClient } from '../server/tests/http-client.js';

const port = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); });
});
const origin = `http://127.0.0.1:${port}`;
const environment = await testEnvironment({ clientOrigin: origin });
let web, browser;
const errors = [];
let checks = 0;
const check = (label) => { checks++; console.log(label + ': passed'); };
const output = 'node_modules/.cache/security-ui';
await mkdir(output, { recursive: true });
try {
    const webEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(DB_|SMTP_|JWT_SECRET|ADMIN_|SNYK_|INTERNAL_OAUTH)/.test(key)));
    web = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
        env: { ...webEnv, OBBS_WEB_PORT: String(port), OBBS_API_PORT: new URL(environment.base).port },
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    web.stdout.on('data', () => {}); web.stderr.on('data', () => {});
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline) {
        try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* starting */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Test frontend did not start');
    const api = apiClient(() => environment.base);
    const email = `ui-${randomBytes(6).toString('hex')}@test.local`;
    const credential = `Aa1-${randomBytes(24).toString('hex')}`;
    const registered = await api('POST', '/auth/register', { body: {
        role: 'donor', name: 'Security Browser User', email, password: credential,
        blood_type: 'O+', date_of_birth: '1996-01-01', region: 'Dar es Salaam', phone: '0712345678',
    } });
    assert.equal(registered.status, 201);
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Account password', { exact: true }).fill(credential);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.getByRole('heading', { name: /Welcome,/ }).waitFor();
    const cookie = (await context.cookies()).find((item) => item.name === 'obbs_session');
    assert.ok(cookie?.httpOnly);
    assert.equal(await page.evaluate(() => localStorage.getItem('obbs_token')), null);
    assert.ok(!(await page.evaluate(() => document.cookie)).includes('obbs_session'));
    check('Login uses an HttpOnly cookie without a stored bearer token');
    await page.reload();
    await page.getByRole('heading', { name: /Welcome,/ }).waitFor();
    check('Session survives a browser reload');

    await page.goto(origin + '/profile');
    await page.getByRole('heading', { name: 'My profile', exact: true, level: 1 }).waitFor();
    await page.evaluate(async () => {
        const { api } = await import('/src/api.js');
        await api('/auth/me', { method: 'PUT', body: {} });
    });
    await context.clearCookies({ name: 'obbs_csrf' });
    const statuses = [];
    page.on('response', (response) => {
        if (response.url().endsWith('/api/auth/me') && response.request().method() === 'PUT') statuses.push(response.status());
    });
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByText('Profile updated', { exact: true }).waitFor();
    assert.deepEqual(statuses.slice(-2), [403, 200]);
    check('Expired CSRF state refreshes once and completes the rejected change');

    const newCredential = `Aa1-${randomBytes(24).toString('hex')}`;
    await page.getByLabel('Current password', { exact: true }).fill(credential);
    await page.getByLabel(/^New password/).fill(newCredential);
    await page.getByLabel('Confirm new password', { exact: true }).fill(newCredential);
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await page.getByText('Password changed', { exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'My profile', exact: true, level: 1 }).waitFor();
    check('Password changes keep the new cookie session');

    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + '/dashboard');
        await page.getByRole('heading', { name: /Welcome,/ }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `${output}/donor-${width}.png`, fullPage: true });
        check(`Donor dashboard at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const payload = '</title><script>window.__security_xss=1</script><img src=x onerror=window.__security_xss=1>';
    for (const type of ['certificate', 'card']) {
        const pending = page.waitForEvent('download');
        await page.evaluate(async ({ type, payload }) => {
            if (type === 'certificate') {
                const { downloadCertificate } = await import('/src/utils/certificate.js');
                downloadCertificate({ id: 7, donation_date: '2026-10-10', blood_type: 'O+', units: 1, volume_ml: 450, bank_name: payload }, payload);
            } else {
                const { downloadDonorCard } = await import('/src/utils/donorCard.js');
                downloadDonorCard({ donorNumber: 'OBBS-000007', name: payload, blood_type: 'O+', donations: 1, member_since: '2026-01-01', blood_type_confirmed_at: '2026-10-10', badge: { label: 'First donation' } });
            }
        }, { type, payload });
        const download = await pending;
        const html = await readFile(await download.path(), 'utf8');
        assert.ok(html.includes('Content-Security-Policy'));
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;'));
        const view = await context.newPage();
        await view.setContent(html);
        assert.equal(await view.evaluate(() => window.__security_xss), undefined);
        await view.close();
        check(`${type} download preserves layout and escapes executable text`);
    }
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.waitForURL('**/login');
    await page.reload();
    assert.ok(!(await context.cookies()).some((item) => item.name === 'obbs_session'));
    check('Server logout removes the cookie and prevents session restoration');

    await page.getByLabel('Email', { exact: true }).fill(environment.adminEmail);
    await page.getByLabel('Account password', { exact: true }).fill(environment.adminCredential);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.goto(origin + '/dashboard/reports');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).waitFor();
    const pdfPending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const pdf = await pdfPending;
    assert.match(pdf.suggestedFilename(), /\.pdf$/);
    assert.equal((await readFile(await pdf.path())).subarray(0, 5).toString(), '%PDF-');
    check('Manager PDF export works with the patched PDF library');
    assert.deepEqual(errors, []);
    console.log(`${checks} browser security checks passed in a disposable database.`);
} finally {
    await browser?.close();
    if (web && web.exitCode == null) {
        const ended = new Promise((resolve) => web.once('exit', resolve)); web.kill(); await ended;
    }
    await environment.cleanup();
}
