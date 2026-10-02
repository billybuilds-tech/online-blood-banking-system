// Removes accounts created by the automated API tests (emails ending in @test.local).
// Their appointments, donations, stock, requests and notifications are removed by ON DELETE CASCADE.
import { pool, query } from '../db.js';

try {
    const result = await query("DELETE FROM users WHERE email LIKE '%@test.local'");
    console.log(`Removed ${result.affectedRows} test account(s) and their records.`);
} catch (err) {
    console.error(`Cleaning failed: ${err.message}`);
    process.exitCode = 1;
} finally {
    await pool.end();
}
