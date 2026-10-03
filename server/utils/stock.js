import { RULES } from '../config.js';
import { query, withTransaction } from '../db.js';
import { audit } from './audit.js';
import { HttpError } from './http.js';
import { notify } from './notify.js';
import { BLOOD_TYPES, addDays, compatibleDonorTypes, expiryDate, today } from './rules.js';

/*
 * Stock is kept bag by bag in blood_units (Recommendation 7). blood_stock holds one row per bank
 * and group: its units column is the number of usable bags, and the row is locked before any bag
 * of that group changes, so two staff can never hand out the same bag.
 */

async function lockStock(q, bankId, bloodType) {
    const rows = await q('SELECT id FROM blood_stock WHERE blood_bank_id = ? AND blood_type = ? FOR UPDATE', [bankId, bloodType]);
    if (!rows.length) {
        await q(
            `INSERT INTO blood_stock (blood_bank_id, blood_type, units) VALUES (?, ?, 0)
             ON DUPLICATE KEY UPDATE units = units`,
            [bankId, bloodType]);
    }
}

// Recounts the usable bags. A locking read sees the latest saved bags, not an older snapshot.
async function refreshStock(q, bankId, bloodType) {
    const [{ units }] = await q(
        `SELECT COUNT(*) AS units FROM blood_units
         WHERE blood_bank_id = ? AND blood_type = ? AND status = 'available' AND expiry_date >= ?
         LOCK IN SHARE MODE`,
        [bankId, bloodType, today()]);
    await q('UPDATE blood_stock SET units = ? WHERE blood_bank_id = ? AND blood_type = ?', [units, bankId, bloodType]);
    return Number(units);
}

/*
 * Adds bags to a bank's stock and returns their ids. Bags from a verified donation keep its date,
 * volume class and link; bags received outside the donation workflow carry their collection date.
 */
export async function addUnits(q, bankId, bloodType, count, { source = 'received', donationId = null, classification = null, collectedOn = today() } = {}) {
    await lockStock(q, bankId, bloodType);
    const ids = [];
    for (let i = 0; i < count; i += 1) {
        const result = await q(
            `INSERT INTO blood_units (blood_bank_id, blood_type, source, donation_id, classification, collected_on, expiry_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [bankId, bloodType, source, donationId, classification, collectedOn, expiryDate(collectedOn)]);
        ids.push(result.insertId);
    }
    await refreshStock(q, bankId, bloodType);
    return ids;
}

// Marks a group's bags that are past their expiry date as expired and tells the bank. The stock row must be locked.
async function expireGroup(q, bankId, bloodType, onDate) {
    const result = await q(
        `UPDATE blood_units SET status = 'expired', status_changed_at = NOW()
         WHERE blood_bank_id = ? AND blood_type = ? AND status = 'available' AND expiry_date < ?`,
        [bankId, bloodType, onDate]);
    const expired = result.affectedRows;
    if (expired) {
        await refreshStock(q, bankId, bloodType);
        await notify(bankId, {
            category: 'expiry',
            title: 'Expired blood removed: {bloodType}',
            message: '{units} bag(s) of {bloodType} passed the expiry date and were removed from the available stock. Dispose of them safely.',
            vars: { units: expired, bloodType },
        }, q);
        await checkLowStock(q, bankId, bloodType);
        const [bank] = await q('SELECT name FROM users WHERE id = ?', [bankId]);
        await audit(null, 'stock.expired', {
            entityType: 'blood_bank', entityId: bankId, subject: { id: bankId, name: bank?.name }, details: { units: expired, bloodType, bank: bank?.name },
        }, q);
    }
    return expired;
}

/*
 * Chooses the bags to hand out (Listing 5.1): usable bags of the group, those that expire first
 * leaving first (FEFO). Expired bags are never chosen. Runs inside a transaction.
 */
export async function takeFromStock(q, bankId, bloodType, units) {
    await lockStock(q, bankId, bloodType);
    await expireGroup(q, bankId, bloodType, today());
    const bags = await q(
        `SELECT id FROM blood_units
         WHERE blood_bank_id = ? AND blood_type = ? AND status = 'available' AND expiry_date >= ?
         ORDER BY expiry_date, id LIMIT ? FOR UPDATE`,
        [bankId, bloodType, today(), units]);
    if (bags.length < units) {
        throw new HttpError(409, 'Not enough {bloodType} in stock ({available} available, {units} needed)',
            { shortage: true, available: bags.length, vars: { bloodType, available: bags.length, units } });
    }
    return bags.map((b) => b.id);
}

// Issues bags for an approved blood request and thanks each donor whose blood was used.
export async function issueUnits(q, bankId, bloodType, units, requestId) {
    const ids = await takeFromStock(q, bankId, bloodType, units);
    await q("UPDATE blood_units SET status = 'issued', blood_request_id = ?, status_changed_at = NOW() WHERE id IN (?)", [requestId, ids]);
    await refreshStock(q, bankId, bloodType);
    await checkLowStock(q, bankId, bloodType);

    const donors = await q(
        `SELECT dn.donor_id, dn.donation_date, b.name AS bank
         FROM blood_units u JOIN donations dn ON dn.id = u.donation_id JOIN users b ON b.id = dn.blood_bank_id
         WHERE u.id IN (?)`,
        [ids]);
    for (const d of donors) {
        await notify(d.donor_id, {
            category: 'donation_used',
            title: 'Your blood is helping a patient',
            message: 'The blood you donated on {date} at {bank} has been issued to a patient. Thank you for saving a life!',
            vars: { date: d.donation_date, bank: d.bank },
        }, q);
    }
    return ids;
}

// Moves bags from the supplying bank to the requesting bank; each bag keeps its number and expiry date.
export async function transferUnits(q, supplierId, receiverId, bloodType, units, transferId) {
    // Both rows are locked in a fixed order so two opposite transfers cannot block each other.
    for (const id of [supplierId, receiverId].sort((a, b) => a - b)) await lockStock(q, id, bloodType);
    const ids = await takeFromStock(q, supplierId, bloodType, units);
    await q('UPDATE blood_units SET blood_bank_id = ?, transfer_id = ?, expiry_warned_at = NULL WHERE id IN (?)', [receiverId, transferId, ids]);
    await refreshStock(q, supplierId, bloodType);
    await refreshStock(q, receiverId, bloodType);
    await checkLowStock(q, supplierId, bloodType);
    return ids;
}

export const DISCARD_REASON_LABELS = {
    damaged: 'Bag damaged or leaking',
    cold_chain: 'Storage temperature not kept',
    missing: 'Missing at stock count',
    other: 'Other reason',
};
export const DISCARD_REASONS = Object.keys(DISCARD_REASON_LABELS);

const ALREADY_OUT = {
    issued: 'This bag has already been issued',
    expired: 'This bag has already expired',
    discarded: 'This bag has already been discarded',
};

// Removes one bag from use (damaged, storage temperature not kept, missing at a count, or another reason).
export async function discardUnit(q, bankId, unitId, reason, notes) {
    const [bag] = await q('SELECT id, blood_bank_id, blood_type FROM blood_units WHERE id = ?', [unitId]);
    if (!bag || bag.blood_bank_id !== bankId) throw new HttpError(404, 'Blood bag not found');
    await lockStock(q, bankId, bag.blood_type);
    // Read again under the lock: the bag may have been issued or transferred in the meantime.
    const [current] = await q('SELECT blood_bank_id, status FROM blood_units WHERE id = ? FOR UPDATE', [unitId]);
    if (current.blood_bank_id !== bankId) throw new HttpError(404, 'Blood bag not found');
    if (current.status !== 'available') throw new HttpError(409, ALREADY_OUT[current.status]);
    await q("UPDATE blood_units SET status = 'discarded', discard_reason = ?, discard_notes = ?, status_changed_at = NOW() WHERE id = ?",
        [reason, notes, unitId]);
    await refreshStock(q, bankId, bag.blood_type);
    await checkLowStock(q, bankId, bag.blood_type);
    return bag;
}

/*
 * Daily expiry check, run every hour by index.js: removes expired bags from the available stock
 * and warns each bank once about bags that expire within EXPIRY_WARNING_DAYS, so they are used first.
 */
export async function checkExpiry(onDate = today()) {
    const groups = await query(
        "SELECT DISTINCT blood_bank_id, blood_type FROM blood_units WHERE status = 'available' AND expiry_date < ?", [onDate]);
    let expired = 0;
    for (const g of groups) {
        expired += await withTransaction(async (q) => {
            await lockStock(q, g.blood_bank_id, g.blood_type);
            return expireGroup(q, g.blood_bank_id, g.blood_type, onDate);
        });
    }

    const warnBefore = addDays(onDate, RULES.EXPIRY_WARNING_DAYS);
    const soon = await query(
        `SELECT blood_bank_id, blood_type, COUNT(*) AS units, MIN(expiry_date) AS first_expiry
         FROM blood_units
         WHERE status = 'available' AND expiry_warned_at IS NULL AND expiry_date BETWEEN ? AND ?
         GROUP BY blood_bank_id, blood_type`,
        [onDate, warnBefore]);
    for (const g of soon) {
        await withTransaction(async (q) => {
            await q(
                `UPDATE blood_units SET expiry_warned_at = NOW()
                 WHERE blood_bank_id = ? AND blood_type = ? AND status = 'available' AND expiry_warned_at IS NULL AND expiry_date BETWEEN ? AND ?`,
                [g.blood_bank_id, g.blood_type, onDate, warnBefore]);
            await notify(g.blood_bank_id, {
                category: 'expiry',
                title: 'Blood expiring soon: {bloodType}',
                message: '{units} bag(s) of {bloodType} expire from {date}. Issue them first or offer them to another bank.',
                vars: { units: Number(g.units), bloodType: g.blood_type, date: g.first_expiry },
            }, q);
        });
    }
    return { expired, warned: soon.length };
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
            title: 'Low stock: {bloodType}',
            message: 'Only {units} unit(s) of {bloodType} remain. The alert level is {threshold} units.',
            vars: { bloodType, units: row.units, threshold: RULES.LOW_STOCK_THRESHOLD },
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
