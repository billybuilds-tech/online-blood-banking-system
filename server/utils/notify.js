import { query } from '../db.js';

/*
 * Stores one notification row per receiver, so each user has their own read/unread state.
 * q is the transaction query function when called inside withTransaction.
 */
export async function notify(recipientId, { category = 'general', title, message, method = 'in_app', senderId = null }, q = query) {
    await q(
        'INSERT INTO notifications (recipient_id, sender_id, category, title, message, method) VALUES (?, ?, ?, ?, ?, ?)',
        [recipientId, senderId, category, title, message, method]);
}

export async function notifyRole(role, payload, q = query) {
    const users = await q("SELECT id FROM users WHERE role = ? AND status = 'approved'", [role]);
    for (const user of users) {
        await notify(user.id, payload, q);
    }
}
