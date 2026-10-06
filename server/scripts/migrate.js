// Brings an existing database up to date with schema.sql without losing data.
// Safe to run many times: each change is applied only if it is missing.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { pool, query } from '../db.js';
import { expiryDate, today } from '../utils/rules.js';

// Tables added after the first release; their CREATE TABLE statements are read from schema.sql.
const TABLES = ['deferrals', 'donor_appeals', 'appeal_recipients', 'blood_units', 'audit_log', 'password_resets', 'campaigns'];

/*
 * When bag tracking starts, each counted unit becomes a bag. Donations at the same bank and group
 * that are still within their shelf life are linked to bags, newest first; the remaining units are
 * recorded as opening stock dated today. The counts in blood_stock do not change.
 */
async function backfillUnits() {
    const now = today();
    const counted = await query('SELECT blood_bank_id, blood_type, units FROM blood_stock WHERE units > 0');
    for (const { blood_bank_id: bank, blood_type: type, units } of counted) {
        const donations = await query(
            `SELECT id, classification, donation_date, expiry_date FROM donations
             WHERE blood_bank_id = ? AND blood_type = ? AND expiry_date >= ?
             ORDER BY donation_date DESC, id DESC LIMIT ?`,
            [bank, type, now, units]);
        for (const d of donations) {
            await query(
                `INSERT INTO blood_units (blood_bank_id, blood_type, source, donation_id, classification, collected_on, expiry_date)
                 VALUES (?, ?, 'donation', ?, ?, ?, ?)`,
                [bank, type, d.id, d.classification, d.donation_date, d.expiry_date]);
        }
        for (let i = donations.length; i < units; i += 1) {
            await query(
                "INSERT INTO blood_units (blood_bank_id, blood_type, source, collected_on, expiry_date) VALUES (?, ?, 'opening', ?, ?)",
                [bank, type, now, expiryDate(now)]);
        }
    }
}
const TABLE_BACKFILLS = { blood_units: backfillUnits };

const COLUMNS = [
    { table: 'appointments', column: 'collected_volume_ml', definition: 'SMALLINT UNSIGNED NULL AFTER status' },
    { table: 'donations', column: 'volume_ml', definition: 'SMALLINT UNSIGNED NULL AFTER units' },
    { table: 'donations', column: 'classification', definition: "ENUM('standard', 'low_volume') NULL AFTER volume_ml" },
    { table: 'notifications', column: 'params', definition: 'JSON NULL AFTER message' },
    { table: 'appointments', column: 'questionnaire', definition: 'JSON NULL AFTER notes' },
    { table: 'appointments', column: 'screening', definition: 'JSON NULL AFTER questionnaire' },
    { table: 'appointments', column: 'appeal_id', definition: 'INT UNSIGNED NULL AFTER screening' },
    { table: 'appointments', column: 'campaign_id', definition: 'INT UNSIGNED NULL AFTER appeal_id' },
    { table: 'donations', column: 'reminder_sent_at', definition: 'DATETIME NULL AFTER expiry_date' },
    {
        table: 'users', column: 'blood_type_confirmed_at', definition: 'DATETIME NULL AFTER blood_type',
        // Blood groups of donors who already have verified donations were seen by a blood bank.
        backfill: `UPDATE users u
                   JOIN (SELECT donor_id, MIN(created_at) AS first_donation, MIN(blood_bank_id) AS bank FROM donations GROUP BY donor_id) d
                     ON d.donor_id = u.id
                   SET u.blood_type_confirmed_at = d.first_donation, u.blood_type_confirmed_by = d.bank
                   WHERE u.role = 'donor'`,
    },
    { table: 'users', column: 'blood_type_confirmed_by', definition: 'INT UNSIGNED NULL AFTER blood_type_confirmed_at' },
    { table: 'users', column: 'password_changed_at', definition: 'DATETIME NULL AFTER profile' },
    {
        table: 'blood_requests', column: 'decided_at', definition: 'DATETIME NULL AFTER rejection_reason',
        backfill: "UPDATE blood_requests SET decided_at = updated_at WHERE status <> 'pending'",
    },
    {
        table: 'blood_requests', column: 'delivery_status',
        definition: "ENUM('preparing', 'ready', 'dispatched', 'received') NULL AFTER decided_at",
        // Requests approved before tracking started are taken as received, at an unknown time.
        backfill: "UPDATE blood_requests SET delivery_status = 'received' WHERE status = 'approved'",
    },
    { table: 'blood_requests', column: 'courier_name', definition: 'VARCHAR(120) NULL AFTER delivery_status' },
    { table: 'blood_requests', column: 'courier_phone', definition: 'VARCHAR(30) NULL AFTER courier_name' },
    { table: 'blood_requests', column: 'ready_at', definition: 'DATETIME NULL AFTER courier_phone' },
    { table: 'blood_requests', column: 'dispatched_at', definition: 'DATETIME NULL AFTER ready_at' },
    { table: 'blood_requests', column: 'received_at', definition: 'DATETIME NULL AFTER dispatched_at' },
    { table: 'blood_requests', column: 'received_confirmed_by', definition: "ENUM('recipient', 'bank') NULL AFTER received_at" },
    // Requests made before these columns existed keep them empty.
    { table: 'blood_requests', column: 'patient_name', definition: 'VARCHAR(120) NULL AFTER reason' },
    { table: 'blood_requests', column: 'hospital', definition: 'VARCHAR(150) NULL AFTER patient_name' },
    { table: 'blood_requests', column: 'ward', definition: 'VARCHAR(80) NULL AFTER hospital' },
    { table: 'blood_requests', column: 'indication', definition: "ENUM('surgery', 'childbirth', 'anaemia', 'trauma', 'blood_disorder', 'cancer', 'other') NULL AFTER ward" },
    { table: 'blood_requests', column: 'doctor_name', definition: 'VARCHAR(120) NULL AFTER indication' },
    { table: 'blood_requests', column: 'doctor_reg_no', definition: 'VARCHAR(40) NULL AFTER doctor_name' },
    { table: 'blood_requests', column: 'doctor_phone', definition: 'VARCHAR(30) NULL AFTER doctor_reg_no' },
    { table: 'blood_requests', column: 'confirmed_with', definition: 'VARCHAR(120) NULL AFTER rejection_reason' },
    { table: 'blood_requests', column: 'confirmed_at', definition: 'DATETIME NULL AFTER confirmed_with' },
    { table: 'users', column: 'language', definition: "ENUM('en', 'sw') NOT NULL DEFAULT 'en' AFTER password_changed_at" },
    { table: 'users', column: 'email_notifications', definition: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER language' },
    { table: 'notifications', column: 'email_status', definition: "ENUM('pending', 'sent', 'failed') NULL AFTER sent_at" },
    { table: 'notifications', column: 'email_attempts', definition: 'TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER email_status' },
    { table: 'notifications', column: 'emailed_at', definition: 'DATETIME NULL AFTER email_attempts' },
];

// Indexes added after the first release: [table, index name, columns].
const INDEXES = [
    ['notifications', 'idx_notifications_email', 'email_status'],
];

// ENUM columns that gained values: [table, column, full new definition, value that must exist].
const ENUMS = [
    ['appointments', 'status', "ENUM('pending', 'approved', 'completed', 'rejected', 'deferred') NOT NULL DEFAULT 'pending'", 'deferred'],
];

async function columnType(table, column) {
    const [row] = await query(
        'SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [config.db.database, table, column]);
    return row?.type ?? null;
}

async function indexExists(table, index) {
    const rows = await query('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
        [config.db.database, table, index]);
    return rows.length > 0;
}

async function tableExists(table) {
    const rows = await query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [config.db.database, table]);
    return rows.length > 0;
}

async function createStatement(table) {
    const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
    const match = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\) ENGINE[^;]*;`).exec(schema);
    if (!match) throw new Error(`schema.sql has no CREATE TABLE for ${table}`);
    return match[0];
}

export async function migrate() {
    const applied = [];
    const backfills = [];
    for (const { table, column, definition, backfill } of COLUMNS) {
        if (!(await columnType(table, column))) {
            await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
            applied.push(`${table}.${column}`);
            if (backfill) backfills.push(backfill);
        }
    }
    for (const sql of backfills) await query(sql);

    for (const [table, column, definition, value] of ENUMS) {
        if (!(await columnType(table, column)).includes(`'${value}'`)) {
            await query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`);
            applied.push(`${table}.${column} += ${value}`);
        }
    }
    for (const [table, index, columns] of INDEXES) {
        if (!(await indexExists(table, index))) {
            await query(`ALTER TABLE \`${table}\` ADD KEY \`${index}\` (${columns})`);
            applied.push(`index ${table}.${index}`);
        }
    }
    for (const table of TABLES) {
        if (!(await tableExists(table))) {
            await query(await createStatement(table));
            applied.push(`table ${table}`);
            try {
                if (TABLE_BACKFILLS[table]) await TABLE_BACKFILLS[table]();
            } catch (err) {
                // Remove the half-filled table so the next run starts again.
                await query(`DROP TABLE \`${table}\``);
                throw err;
            }
        }
    }
    return applied;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const applied = await migrate();
        console.log(applied.length ? `Added: ${applied.join(', ')}` : 'Database is up to date.');
    } catch (err) {
        console.error(`Migration failed: ${err.message}`);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}
