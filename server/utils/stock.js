import { RULES } from '../config.js';
import { HttpError } from './http.js';
import { notify } from './notify.js';
import { BLOOD_TYPES, compatibleDonorTypes } from './rules.js';

/*
 * Reduces stock for an approved request or transfer. Must run inside a transaction:
 * the stock row is locked so two staff cannot approve against the same units at once.
 */
export async function takeFromStock(q, bankId, bloodType, units) {
    const rows = await q(
        'SELECT id, units FROM blood_stock WHERE blood_bank_id = ? AND blood_type = ? FOR UPDATE',
        [bankId, bloodType]);
    const available = rows.length ? rows[0].units : 0;
    if (available < units) {
        throw new HttpError(409, `Not enough ${bloodType} in stock (${available} available, ${units} needed)`,
            { shortage: true, available });
    }
    await q('UPDATE blood_stock SET units = units - ? WHERE id = ?', [units, rows[0].id]);
    await checkLowStock(q, bankId, bloodType);
}

export async function addToStock(q, bankId, bloodType, units) {
    await q(
        `INSERT INTO blood_stock (blood_bank_id, blood_type, units) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE units = units + VALUES(units)`,
        [bankId, bloodType, units]);
}

export async function setStock(q, bankId, bloodType, units) {
    await q(
        `INSERT INTO blood_stock (blood_bank_id, blood_type, units) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE units = VALUES(units)`,
        [bankId, bloodType, units]);
    await checkLowStock(q, bankId, bloodType);
}

// Creates a zero row for every blood group so a newly approved bank shows a full stock table.
export async function initialiseStock(q, bankId) {
    for (const type of BLOOD_TYPES) {
        await q('INSERT IGNORE INTO blood_stock (blood_bank_id, blood_type, units) VALUES (?, ?, 0)', [bankId, type]);
    }
}

export async function checkLowStock(q, bankId, bloodType) {
    const [row] = await q('SELECT units FROM blood_stock WHERE blood_bank_id = ? AND blood_type = ?', [bankId, bloodType]);
    if (row && row.units < RULES.LOW_STOCK_THRESHOLD) {
        await notify(bankId, {
            category: 'low_stock',
            title: `Low stock: ${bloodType}`,
            message: `Only ${row.units} unit(s) of ${bloodType} remain. The alert level is ${RULES.LOW_STOCK_THRESHOLD} units.`,
        }, q);
    }
}

// Groups compatible with the recipient's group that the bank currently holds.
export async function compatibleInStock(q, bankId, recipientType) {
    const types = compatibleDonorTypes(recipientType).filter((t) => t !== recipientType);
    if (!types.length) return [];
    return q(
        'SELECT blood_type, units FROM blood_stock WHERE blood_bank_id = ? AND blood_type IN (?) AND units > 0 ORDER BY units DESC',
        [bankId, types]);
}
