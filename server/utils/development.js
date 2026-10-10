import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { config } from '../config.js';
import { isStrongPassword } from './validate.js';

export function demoCredential() {
    if (config.production) throw new Error('Demo seeding is disabled in production.');
    const value = process.env.DEMO_PASSWORD || `Aa1-${randomBytes(24).toString('hex')}`;
    if (!isStrongPassword(value)) throw new Error('DEMO_PASSWORD must meet the account password requirements.');
    return value;
}

export async function recordDemoCredential(address, value) {
    const file = new URL('../../.local/demo-credentials.json', import.meta.url);
    let saved = {};
    try { saved = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid private demo credential file');
    saved[address] = value;
    await mkdir(new URL('../../.local/', import.meta.url), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
}
