import { spawn } from 'node:child_process';
import { testEnvironment } from './test-environment.js';

const environment = await testEnvironment();
try {
    const load = process.argv.includes('--load');
    const args = load ? ['tests/load.js'] : ['--test', '--test-concurrency=1', 'tests/api.test.js', 'tests/security-api.test.js'];
    const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { env: environment.env, cwd: new URL('../', import.meta.url), windowsHide: true, stdio: 'inherit' });
        child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1));
    });
    process.exitCode = result || 0;
} finally { await environment.cleanup(); }
