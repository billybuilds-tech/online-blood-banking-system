// Removes data created by the automated API tests: accounts with emails ending in @test.local
// (their appointments, donations, stock, requests and notifications go with them through
// ON DELETE CASCADE), the registration notices those accounts sent to the manager, and the
// audit rows about them.
import { pathToFileURL } from 'node:url';
import { pool, query } from '../db.js';
import { config } from '../config.js';

const TEST_NAMES = [
    'Test Donor', 'Second Donor', 'Third Donor', 'Fourth Donor', 'Fifth Donor', 'Sixth Donor', 'Seventh Donor', 'Eighth Donor',
    'Test Recipient', 'Test Bank A', 'Test Bank B',
];

// Login attempts made by the tests with addresses that belong to no account.
const TEST_LOGIN_EMAILS = ["' OR '1'='1"];

export async function cleanTestData() {
    if (!/^obbs_test[a-z0-9_]*$/.test(config.db.database))
        throw new Error('Test cleanup is restricted to databases whose names start with obbs_test.');
    // Audit rows about the test accounts, and the tests' failed logins.
    await query(
        `DELETE a FROM audit_log a
         WHERE a.actor_id IN (SELECT id FROM users WHERE email LIKE '%@test.local')
            OR a.subject_id IN (SELECT id FROM users WHERE email LIKE '%@test.local')
            OR (a.action = 'auth.login_failed'
                AND (JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.email')) LIKE '%@test.local'
                     OR JSON_UNQUOTE(JSON_EXTRACT(a.details, '$.email')) IN (?)))`,
        [TEST_LOGIN_EMAILS]);
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
