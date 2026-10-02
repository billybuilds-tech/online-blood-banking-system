// Brings an existing database up to date with schema.sql without losing data.
// Safe to run many times: each change is applied only if it is missing.
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { pool, query } from '../db.js';

const COLUMNS = [
    { table: 'appointments', column: 'collected_volume_ml', definition: 'SMALLINT UNSIGNED NULL AFTER status' },
    { table: 'donations', column: 'volume_ml', definition: 'SMALLINT UNSIGNED NULL AFTER units' },
    { table: 'donations', column: 'classification', definition: "ENUM('standard', 'low_volume') NULL AFTER volume_ml" },
    { table: 'notifications', column: 'params', definition: 'JSON NULL AFTER message' },
];

async function columnExists(table, column) {
    const rows = await query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [config.db.database, table, column]);
    return rows.length > 0;
}

export async function migrate() {
    const applied = [];
    for (const { table, column, definition } of COLUMNS) {
        if (!(await columnExists(table, column))) {
            await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
            applied.push(`${table}.${column}`);
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
