import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

export function testDatabaseName(value = `obbs_test_${randomBytes(6).toString('hex')}`) {
    if (!/^obbs_test[a-z0-9_]*$/.test(value)) throw new Error('Test database names must start with obbs_test.');
    return value;
}

export async function testEnvironment({ clientOrigin } = {}) {
    const database = testDatabaseName(process.env.TEST_DB_NAME);
    const { database: _production, ...settings } = config.db;
    const db = await mysql.createConnection({ ...settings, multipleStatements: true });
    let created = false, server, output = '';
    const adminEmail = `manager-${randomBytes(8).toString('hex')}@example.invalid`;
    const adminCredential = `Aa1-${randomBytes(24).toString('hex')}`;
    try {
        await db.query(`CREATE DATABASE ${mysql.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        created = true;
        await db.query(`USE ${mysql.escapeId(database)}`);
        await db.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
        await db.query("INSERT INTO users (role,status,name,email,password_hash,verified) VALUES ('admin','approved','Test Manager',?,?,1)",
            [adminEmail, await bcrypt.hash(adminCredential, 10)]);
        const env = { ...process.env, NODE_ENV: 'test', DB_NAME: database, SMTP_HOST: '',
            JWT_SECRET: randomBytes(32).toString('hex'), ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminCredential,
            HOST: '127.0.0.1', PORT: '0',
            ...(clientOrigin ? { CLIENT_ORIGIN: clientOrigin } : {}) };
        const net = await import('node:net');
        const port = await new Promise((resolve) => {
            const listener = net.createServer();
            listener.listen(0, '127.0.0.1', () => { const n = listener.address().port; listener.close(() => resolve(n)); });
        });
        env.PORT = String(port);
        env.API_URL = `http://127.0.0.1:${port}/api`;
        server = spawn(process.execPath, [fileURLToPath(new URL('../index.js', import.meta.url))], {
            cwd: fileURLToPath(new URL('../', import.meta.url)), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        });
        server.stdout.on('data', (chunk) => { output += chunk; });
        server.stderr.on('data', (chunk) => { output += chunk; });
        const deadline = Date.now() + 20000;
        let ready = false;
        while (Date.now() < deadline) {
            if (server.exitCode != null) throw new Error('Test API exited before it was ready.');
            try {
                const response = await fetch(env.API_URL + '/health', { signal: AbortSignal.timeout(1000) });
                if (response.ok) { ready = true; break; }
            } catch { /* server starting */ }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!ready) throw new Error('Test API did not become ready.');
        return { env, db, database, adminEmail, adminCredential, base: env.API_URL,
            cleanup: async () => {
                if (server.exitCode == null) {
                    const ended = new Promise((resolve) => server.once('exit', resolve));
                    server.kill(); await ended;
                }
                testDatabaseName(database);
                await db.query(`DROP DATABASE ${mysql.escapeId(database)}`);
                await db.end();
            }, logs: () => output };
    } catch (error) {
        server?.kill();
        if (created) await db.query(`DROP DATABASE ${mysql.escapeId(testDatabaseName(database))}`);
        await db.end();
        throw error;
    }
}
