import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
    ...config.db,
    connectionLimit: 10,
    waitForConnections: true,
    dateStrings: true,
});

// Every query uses ? placeholders; values are never joined into the SQL text.
export async function query(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows;
}

/*
 * Runs fn(q) inside one database transaction. If fn throws, every change is rolled back.
 */
export async function withTransaction(fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const q = async (sql, params = []) => {
            const [rows] = await conn.query(sql, params);
            return rows;
        };
        const result = await fn(q);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}
