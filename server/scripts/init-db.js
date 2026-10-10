// Creates the database named in .env (if missing) and all tables from schema.sql.
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const { database, ...connection } = config.db;
const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');

const conn = await mysql.createConnection({ ...connection, multipleStatements: true });
try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE ${mysql.escapeId(database)}`);
    await conn.query(schema);
    console.log(`Database "${database}" is ready.`);
    console.log('Next step: npm run create-admin');
} catch (err) {
    console.error(`Database setup failed: ${err.message}`);
    process.exitCode = 1;
} finally {
    await conn.end();
}
