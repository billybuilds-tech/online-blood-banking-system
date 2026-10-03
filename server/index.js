import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { sendEligibilityReminders } from './utils/reminders.js';
import { today } from './utils/rules.js';
import { checkExpiry } from './utils/stock.js';

if (!process.env.JWT_SECRET) {
    console.warn('Warning: JWT_SECRET is not set. Copy .env.example to .env and set a long random secret.');
}

try {
    await pool.query('SELECT 1');
    console.log(`Connected to MySQL database "${config.db.database}"`);
} catch (err) {
    console.error(`Could not connect to MySQL: ${err.message}`);
    console.error('Check that MySQL is running and that the values in server/.env are correct.');
}

app.listen(config.port, () => {
    console.log(`Online Blood Banking System API running on http://localhost:${config.port}`);
});

// Once at start-up, then every hour: remove expired bags from stock, warn banks about bags
// that expire soon, and tell donors when they may donate again.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
async function runScheduledChecks() {
    try {
        const { expired, warned } = await checkExpiry(today());
        if (expired || warned) console.log(`Expiry check: ${expired} bag(s) expired, ${warned} warning(s) sent`);
    } catch (err) {
        console.error(`Expiry check failed: ${err.message}`);
    }
    try {
        const sent = await sendEligibilityReminders(today());
        if (sent) console.log(`Sent ${sent} eligibility reminder(s)`);
    } catch (err) {
        console.error(`Eligibility reminders failed: ${err.message}`);
    }
}
runScheduledChecks();
setInterval(runScheduledChecks, CHECK_INTERVAL_MS).unref();
