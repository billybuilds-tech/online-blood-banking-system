// Removes data created by the automated API tests: accounts with emails ending in @test.local
// (their appointments, donations, stock, requests and notifications go with them through
// ON DELETE CASCADE) and the registration notices those accounts sent to the manager.
import { pathToFileURL } from 'node:url';
import { pool, query } from '../db.js';

const TEST_NAMES = ['Test Donor', 'Second Donor', 'Third Donor', 'Fourth Donor', 'Test Recipient', 'Test Bank A', 'Test Bank B'];

export async function cleanTestData() {
    const notices = await query(
        `DELETE FROM notifications
         WHERE category = 'registration'
           AND (JSON_UNQUOTE(JSON_EXTRACT(params, '$.name')) IN (?) OR message REGEXP ?)`,
        [TEST_NAMES, `^(${TEST_NAMES.join('|')}) registered`]);
    const users = await query("DELETE FROM users WHERE email LIKE '%@test.local'");
    return { users: users.affectedRows, notices: notices.affectedRows };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const removed = await cleanTestData();
        console.log(`Removed ${removed.users} test account(s) and ${removed.notices} test registration notice(s).`);
    } catch (err) {
        console.error(`Cleaning failed: ${err.message}`);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}
