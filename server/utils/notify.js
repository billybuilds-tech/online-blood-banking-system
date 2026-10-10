import { query } from '../db.js';
import { publish } from './live.js';
import { isDeliverable, mailerReady } from './mailer.js';

// Started by utils/emailOutbox.js (from index.js) when an email account is set; sends waiting emails.
let wakeMailer = () => {};
export function onEmailQueued(fn) {
    wakeMailer = fn;
}

/*
 * A notification is also emailed when an email account is set, the receiver keeps email
 * notifications on and has a real address. The manager's announcements are emailed only when
 * sent with the email method.
 */
async function emailStatus(recipientId, category, method, q) {
    if (!mailerReady() || (category === 'announcement' && method !== 'email')) return null;
    const [user] = await q('SELECT email, email_notifications FROM users WHERE id = ?', [recipientId]);
    return user?.email_notifications && isDeliverable(user.email) ? 'pending' : null;
}

/*
 * Stores one notification row per receiver, so each user has their own read/unread state,
 * and pushes it to the receiver's open browser tabs.
 * title and message are English templates; vars fills their {placeholders} and is stored
 * in params, so each reader sees the notification in their current language.
 * q is the transaction query function when called inside withTransaction; the push and the
 * email then wait until the transaction commits.
 */
export async function notify(recipientId, { category = 'general', title, message, vars = null, method = 'in_app', senderId = null }, q = query) {
    const email = await emailStatus(recipientId, category, method, q);
    const result = await q(
        'INSERT INTO notifications (recipient_id, sender_id, category, title, message, params, method, email_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [recipientId, senderId, category, title, message, vars ? JSON.stringify(vars) : null, method, email]);

    const deliver = () => {
        const id = parseInt(result.insertId, 10);
        if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid notification identifier');
        publish(recipientId, 'notification', { id, category });
        if (email) wakeMailer();
    };
    if (q.afterCommit) q.afterCommit.push(deliver);
    else deliver();
}

export async function notifyRole(role, payload, q = query) {
    const users = await q("SELECT id FROM users WHERE role = ? AND status = 'approved'", [role]);
    for (const user of users) {
        await notify(user.id, payload, q);
    }
}
