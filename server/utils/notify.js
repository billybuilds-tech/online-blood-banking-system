import { query } from '../db.js';
import { publish } from './live.js';

/*
 * Stores one notification row per receiver, so each user has their own read/unread state,
 * and pushes it to the receiver's open browser tabs.
 * q is the transaction query function when called inside withTransaction; the push then
 * waits until the transaction commits.
 */
export async function notify(recipientId, { category = 'general', title, message, method = 'in_app', senderId = null }, q = query) {
    const result = await q(
        'INSERT INTO notifications (recipient_id, sender_id, category, title, message, method) VALUES (?, ?, ?, ?, ?, ?)',
        [recipientId, senderId, category, title, message, method]);

    const push = () => publish(recipientId, 'notification', { id: result.insertId, category });
    if (q.afterCommit) q.afterCommit.push(push);
    else push();
}

export async function notifyRole(role, payload, q = query) {
    const users = await q("SELECT id FROM users WHERE role = ? AND status = 'approved'", [role]);
    for (const user of users) {
        await notify(user.id, payload, q);
    }
}
