// Creates (or resets the password of) the Blood Bank Manager account from the ADMIN_* values in .env.
import bcrypt from 'bcryptjs';
import { pool, query } from '../db.js';
import { isEmail, isStrongPassword, PASSWORD_RULE } from '../utils/validate.js';

const name = process.env.ADMIN_NAME || 'Blood Bank Manager';
const email = (process.env.ADMIN_EMAIL || 'manager@obbs.local').toLowerCase();
const password = process.env.ADMIN_PASSWORD || 'Manager@2026';

if (!isEmail(email) || !isStrongPassword(password)) {
    console.error(`ADMIN_EMAIL must be valid. ${PASSWORD_RULE}.`);
    process.exit(1);
}

try {
    const hash = await bcrypt.hash(password, 10);
    const [existing] = await query('SELECT id, role FROM users WHERE email = ?', [email]);
    if (existing && existing.role !== 'admin') {
        console.error(`${email} is already used by a ${existing.role} account.`);
        process.exitCode = 1;
    } else if (existing) {
        await query("UPDATE users SET name = ?, password_hash = ?, status = 'approved' WHERE id = ?", [name, hash, existing.id]);
        console.log(`Blood Bank Manager account updated: ${email}`);
    } else {
        await query(
            "INSERT INTO users (role, status, name, email, password_hash, verified) VALUES ('admin', 'approved', ?, ?, ?, 1)",
            [name, email, hash]);
        console.log(`Blood Bank Manager account created: ${email}`);
    }
} catch (err) {
    console.error(`Could not create the manager account: ${err.message}`);
    process.exitCode = 1;
} finally {
    await pool.end();
}
