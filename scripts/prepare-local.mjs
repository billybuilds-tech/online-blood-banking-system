import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverRoot = path.join(root, 'server');

export async function ensureEnvironment(example, target) {
    if (existsSync(target)) return false;
    let content = await readFile(example, 'utf8');
    content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(32).toString('hex')}`)
        .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=Aa1-${randomBytes(24).toString('hex')}`);
    await writeFile(target, content, { flag: 'wx', mode: 0o600 });
    return true;
}

const portOpen = (port) => new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (open) => { socket.destroy(); resolve(open); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
});

async function dependencies(directory, name) {
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(path.join(directory, 'package-lock.json'), 'utf8'));
    const fingerprint = createHash('sha256').update(JSON.stringify({ dependencies: manifest.dependencies,
        devDependencies: manifest.devDependencies, packages: lock.packages })).digest('hex');
    const marker = path.join(root, '.local', `dependencies-${name}.txt`);
    if (existsSync(path.join(directory, 'node_modules')) &&
        await readFile(marker, 'utf8').catch(() => '') === fingerprint) return;
    const settings = await readFile(path.join(serverRoot, '.env'), 'utf8').catch(() => '');
    const apiPort = Number(settings.match(/^PORT=(\d+)$/m)?.[1]) || 5000;
    if (await portOpen(apiPort) || await portOpen(5173))
        throw new Error('Close the OBBS API and frontend windows before updating dependencies.');
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm.cmd', 'ci'], {
        cwd: directory, stdio: 'inherit', windowsHide: true,
    });
    if (result.status !== 0) throw new Error(`Dependency installation failed for ${name}.`);
    await mkdir(path.dirname(marker), { recursive: true });
    await writeFile(marker, fingerprint);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const [major, minor] = process.versions.node.split('.').map(Number);
        if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js 22.12 or newer is required.');
        await dependencies(serverRoot, 'server');
        await dependencies(root, 'web');
        await ensureEnvironment(path.join(serverRoot, '.env.example'), path.join(serverRoot, '.env'));
        const requireServer = createRequire(path.join(serverRoot, 'package.json'));
        requireServer('dotenv').config({ path: path.join(serverRoot, '.env'), quiet: true });
        for (const script of ['init-db.js', 'migrate.js']) {
            const result = spawnSync(process.execPath, [path.join(serverRoot, 'scripts', script)], {
                cwd: serverRoot, stdio: 'inherit', windowsHide: true,
            });
            if (result.status !== 0) throw new Error(`${script} failed.`);
        }
        const mysql = requireServer('mysql2/promise');
        const { config } = await import('../server/config.js');
        const db = await mysql.createConnection(config.db);
        try {
            const [[row]] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role='admin'");
            if (!row.count) {
                const result = spawnSync(process.execPath, [path.join(serverRoot, 'scripts/create-admin.js')], {
                    cwd: serverRoot, stdio: 'inherit', windowsHide: true,
                });
                if (result.status !== 0) throw new Error('Set a private ADMIN_PASSWORD in server/.env, then create the manager account.');
            }
        } finally { await db.end(); }
        console.log('OBBS is ready. Existing manager passwords are preserved; new manager credentials are private in server/.env.');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
