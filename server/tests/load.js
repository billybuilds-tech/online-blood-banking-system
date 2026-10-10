/*
 * Load test (Table 5.2): 25 virtual users, each logs in and loads stock, blood requests
 * and appointments, repeated 4 times = 400 requests.
 * Start the server first, then run: npm run test:load
 */
import { config } from '../config.js';
import { apiClient } from './http-client.js';

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}/api`;
const USERS = Number(process.env.LOAD_USERS) || 25;
const ROUNDS = Number(process.env.LOAD_ROUNDS) || 4;
const email = process.env.ADMIN_EMAIL || 'manager@obbs.local';
const password = process.env.ADMIN_PASSWORD;
if (!password || !/^obbs_test[a-z0-9_]*$/.test(config.db.database)) throw new Error('Load tests require private manager credentials and a dedicated obbs_test database.');
const client = apiClient(() => BASE);

const timings = [];
let failed = 0;

async function timed(method, path, { token, body } = {}) {
    const start = performance.now();
    let res;
    try {
        res = await client(method, path, { token, body });
        if (res.status >= 400) failed += 1;
        return res.data;
    } catch {
        failed += 1;
        return {};
    } finally {
        timings.push(performance.now() - start);
    }
}

async function virtualUser() {
    for (let round = 0; round < ROUNDS; round += 1) {
        const { token } = await timed('POST', '/auth/login', { body: { email, password } });
        await timed('GET', '/stock', { token });
        await timed('GET', '/blood-requests', { token });
        await timed('GET', '/appointments', { token });
    }
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const started = performance.now();
await Promise.all(Array.from({ length: USERS }, virtualUser));
const totalSeconds = (performance.now() - started) / 1000;

const sorted = [...timings].sort((a, b) => a - b);
const average = sorted.reduce((sum, t) => sum + t, 0) / sorted.length;

console.log('\nTable 5.2: Load Test Results');
console.table({
    'Concurrent virtual users': USERS,
    'Requests sent': `${sorted.length} (${USERS} users x ${ROUNDS} rounds x 4 calls)`,
    'Failed requests': failed,
    'Total time (s)': totalSeconds.toFixed(2),
    'Throughput (requests/s)': (sorted.length / totalSeconds).toFixed(1),
    'Average response time (ms)': average.toFixed(1),
    'Median response time (ms)': percentile(sorted, 50).toFixed(1),
    '95th percentile (ms)': percentile(sorted, 95).toFixed(1),
    'Slowest response (ms)': sorted.at(-1).toFixed(1),
});
