// Adds demonstration accounts and stock so every dashboard has data (for screenshots and demos).
// All demo accounts use the password Demo1234
import bcrypt from 'bcryptjs';
import { pool, query, withTransaction } from '../db.js';
import { addDays, expiryDate, today } from '../utils/rules.js';
import { addToStock, initialiseStock } from '../utils/stock.js';

const PASSWORD = 'Demo1234';

const BANKS = [
    { name: 'Muhimbili Blood Bank', email: 'muhimbili@demo.local', region: 'Dar es Salaam', address: 'Upanga, Dar es Salaam', phone: '0712 000 001',
        stock: { 'O-': 6, 'O+': 24, 'A-': 3, 'A+': 15, 'B-': 2, 'B+': 11, 'AB-': 1, 'AB+': 5 } },
    { name: 'Dodoma Regional Blood Bank', email: 'dodoma@demo.local', region: 'Dodoma', address: 'Dodoma Regional Hospital', phone: '0712 000 002',
        stock: { 'O-': 2, 'O+': 12, 'A-': 1, 'A+': 8, 'B-': 0, 'B+': 6, 'AB-': 0, 'AB+': 3 } },
    { name: 'Bugando Blood Bank', email: 'bugando@demo.local', region: 'Mwanza', address: 'Bugando Medical Centre', phone: '0712 000 003',
        stock: { 'O-': 4, 'O+': 18, 'A-': 2, 'A+': 9, 'B-': 1, 'B+': 7, 'AB-': 1, 'AB+': 2 } },
];
const PENDING_BANK = { name: 'Mbeya Zonal Blood Bank', email: 'mbeya@demo.local', region: 'Mbeya', address: 'Mbeya Zonal Referral Hospital' };
const DONORS = [
    { name: 'Asha Mwinyi', email: 'asha@demo.local', blood_type: 'O+', date_of_birth: '1996-03-14', region: 'Dar es Salaam' },
    { name: 'Joseph Mushi', email: 'joseph@demo.local', blood_type: 'A+', date_of_birth: '1990-11-02', region: 'Dodoma' },
    { name: 'Neema Kileo', email: 'neema@demo.local', blood_type: 'O-', date_of_birth: '2000-07-21', region: 'Mwanza' },
];
const RECIPIENT = { name: 'Hassan Juma', email: 'hassan@demo.local', blood_type: 'B+', region: 'Dar es Salaam' };

async function upsertUser(u, role, status) {
    const [existing] = await query('SELECT id FROM users WHERE email = ?', [u.email]);
    if (existing) return existing.id;
    const hash = await bcrypt.hash(PASSWORD, 10);
    const result = await query(
        `INSERT INTO users (role, status, name, email, password_hash, phone, blood_type, date_of_birth, region, address, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [role, status, u.name, u.email, hash, u.phone || null, u.blood_type || null, u.date_of_birth || null,
            u.region || null, u.address || null, role === 'bloodbank' && status === 'approved' ? 1 : 0]);
    return result.insertId;
}

try {
    const bankIds = [];
    for (const bank of BANKS) {
        const id = await upsertUser(bank, 'bloodbank', 'approved');
        bankIds.push(id);
        const [has] = await query('SELECT COUNT(*) AS n FROM blood_stock WHERE blood_bank_id = ? AND units > 0', [id]);
        if (!has.n) {
            await withTransaction(async (q) => {
                await initialiseStock(q, id);
                for (const [type, units] of Object.entries(bank.stock)) if (units) await addToStock(q, id, type, units);
            });
        }
    }
    await upsertUser(PENDING_BANK, 'bloodbank', 'pending');

    const donorIds = [];
    for (const donor of DONORS) donorIds.push(await upsertUser(donor, 'donor', 'approved'));
    const recipientId = await upsertUser(RECIPIENT, 'recipient', 'approved');

    // One past verified donation for the first donor, and one pending booking for the second.
    const [hasDonation] = await query('SELECT COUNT(*) AS n FROM donations WHERE donor_id = ?', [donorIds[0]]);
    if (!hasDonation.n) {
        const date = addDays(today(), -40);
        const appt = await query(
            "INSERT INTO appointments (donor_id, blood_bank_id, blood_type, units, appointment_date, status) VALUES (?, ?, 'O+', 1, ?, 'completed')",
            [donorIds[0], bankIds[0], date]);
        await query(
            "INSERT INTO donations (appointment_id, donor_id, blood_bank_id, blood_type, units, donation_date, expiry_date) VALUES (?, ?, ?, 'O+', 1, ?, ?)",
            [appt.insertId, donorIds[0], bankIds[0], date, expiryDate(date)]);
        await query('UPDATE users SET verified = 1 WHERE id = ?', [donorIds[0]]);
    }
    const [hasOpen] = await query("SELECT COUNT(*) AS n FROM appointments WHERE donor_id = ? AND status IN ('pending','approved')", [donorIds[1]]);
    if (!hasOpen.n) {
        await query("INSERT INTO appointments (donor_id, blood_bank_id, blood_type, units, appointment_date) VALUES (?, ?, 'A+', 1, ?)",
            [donorIds[1], bankIds[1], addDays(today(), 3)]);
    }

    const [hasRequest] = await query('SELECT COUNT(*) AS n FROM blood_requests WHERE recipient_id = ?', [recipientId]);
    if (!hasRequest.n) {
        await query("INSERT INTO blood_requests (recipient_id, blood_bank_id, blood_type, units, urgency, reason) VALUES (?, ?, 'B+', 2, 'urgent', 'Surgery, ward 5')",
            [recipientId, bankIds[0]]);
    }

    const [hasTransfer] = await query('SELECT COUNT(*) AS n FROM inter_bank_requests WHERE from_bank_id = ?', [bankIds[1]]);
    if (!hasTransfer.n) {
        await query("INSERT INTO inter_bank_requests (from_bank_id, to_bank_id, blood_type, units, urgency, notes) VALUES (?, ?, 'O-', 3, 'urgent', 'Maternity emergency')",
            [bankIds[1], bankIds[0]]);
    }

    console.log('Demo data ready. Password for every demo account: Demo1234');
    console.log('Blood banks: muhimbili@demo.local, dodoma@demo.local, bugando@demo.local (mbeya@demo.local is pending)');
    console.log('Donors: asha@demo.local, joseph@demo.local, neema@demo.local   Recipient: hassan@demo.local');
} catch (err) {
    console.error(`Seeding failed: ${err.message}`);
    process.exitCode = 1;
} finally {
    await pool.end();
}
