// Brings an existing database up to date with schema.sql without losing data.
// Safe to run many times: each change is applied only if it is missing.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { pool, query } from '../db.js';
import { expiryDate, today } from '../utils/rules.js';

// Tables added after the first release; their CREATE TABLE statements are read from schema.sql.
const TABLES = ['deferrals', 'donor_appeals', 'appeal_recipients', 'blood_units', 'audit_log', 'password_resets'];

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
