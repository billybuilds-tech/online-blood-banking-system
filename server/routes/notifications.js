import { Router } from 'express';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { translateNotification } from '../utils/i18n.js';
import { subscribe } from '../utils/live.js';
import { appLink, isDeliverable, mailerReady, sendMail } from '../utils/mailer.js';
import { notify } from '../utils/notify.js';
import { cleanText, isEmail } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', ah(async (req, res) => {
    const rows = await query(
        `SELECT n.id, n.category, n.title, n.message, n.params, n.method, n.is_read, n.sent_at, n.email_status,
                s.name AS sender_name
         FROM notifications n LEFT JOIN users s ON s.id = n.sender_id
         WHERE n.recipient_id = ?
         ORDER BY n.sent_at DESC, n.id DESC
         LIMIT 100`,
        [req.user.id]);
    const notifications = rows.map((row) => {
        const { params: _params, ...rest } = row;
        return { ...rest, ...translateNotification(req.lang, row), is_read: Boolean(row.is_read) };
    });
    res.json({ notifications, unread: notifications.filter((n) => !n.is_read).length });
}));

/*
 * Server-Sent Events stream: the browser keeps this request open and receives
 * "notification" events the moment they are created. A comment line every 25 s
 * keeps proxies and the browser from closing an idle connection.
 */
router.get('/stream', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    const unsubscribe = subscribe(req.user.id, res);
    res.flushHeaders();
    res.write('retry: 5000\n: connected\n\n');

    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
});

/*
 * Whether notifications are emailed (an email account is set in server/.env). The manager also
 * sees the sending address and how many emails were sent, are waiting or failed in the last 30 days.
 */
router.get('/email', ah(async (req, res) => {
    const configured = mailerReady();
    if (req.user.role !== 'admin') return res.json({ configured });
    const rows = await query(
        `SELECT email_status AS status, COUNT(*) AS n FROM notifications
         WHERE email_status IS NOT NULL AND sent_at >= NOW() - INTERVAL 30 DAY GROUP BY email_status`);
    const count = (status) => Number(rows.find((r) => r.status === status)?.n ?? 0);
    res.json({ configured, from: configured ? config.smtp.from : null, sent: count('sent'), pending: count('pending'), failed: count('failed') });
}));

// The manager sends a test email to check the email account in server/.env.
router.post('/email/test', requireRole('admin'), ah(async (req, res) => {
    const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    if (!isEmail(to)) throw new HttpError(400, 'A valid email address is required');
    if (!mailerReady()) throw new HttpError(400, 'No email account is set. Fill in SMTP_HOST and the other SMTP values in server/.env and restart the API.');
    if (!isDeliverable(to)) throw new HttpError(400, 'Addresses ending in .local or .test are for demonstration accounts and cannot receive email.');
    try {
        await sendMail({
            to,
            subject: req.t('Test email from the Online Blood Banking System'),
            text: req.t('This test email shows that the system can send email. Notifications will now reach users at their email addresses as well.\n\n{link}', { link: appLink() }),
        });
    } catch (err) {
        throw new HttpError(502, 'The email could not be sent: {reason}', { vars: { reason: err.message } });
    }
    res.json({ message: req.t('Test email sent to {to}. Check the inbox, and the spam folder if it is not there.', { to }) });
}));

router.patch('/read-all', ah(async (req, res) => {
    await query('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?', [req.user.id]);
    res.json({ message: req.t('All notifications marked as read') });
}));

router.patch('/:id/read', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const result = await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?', [id, req.user.id]);
    if (!result.affectedRows) throw new HttpError(404, 'Notification not found');
    res.json({ message: req.t('Notification marked as read') });
}));

/*
 * Blood Bank Manager sends a message to one user, a list of users, a whole role, or everyone.
 * With the email method it is also emailed to receivers who keep email notifications on
 * (when an email account is set). SMS is recorded only; no SMS gateway is connected (Section 1.7).
 */
router.post('/', requireRole('admin'), ah(async (req, res) => {
    const body = req.body ?? {};
    const title = cleanText(body.title, 150);
    const message = cleanText(body.message, 2000);
    const method = body.method || 'in_app';
    if (!title || !message) throw new HttpError(400, 'Title and message are required');
    if (!['in_app', 'email', 'sms'].includes(method)) throw new HttpError(400, 'Invalid delivery method');

    let receivers;
    if (body.target === 'all') {
        receivers = await query("SELECT id FROM users WHERE status = 'approved' AND id <> ?", [req.user.id]);
    } else if (body.target === 'role') {
        if (!['donor', 'recipient', 'bloodbank'].includes(body.role)) throw new HttpError(400, 'Invalid role');
        receivers = await query("SELECT id FROM users WHERE status = 'approved' AND role = ?", [body.role]);
    } else if (body.target === 'users') {
        const ids = Array.isArray(body.userIds) ? body.userIds.map(Number).filter(Number.isInteger) : [];
        if (!ids.length) throw new HttpError(400, 'Choose at least one user');
        receivers = await query('SELECT id FROM users WHERE id IN (?)', [ids]);
    } else {
        throw new HttpError(400, 'Target must be all, role or users');
    }
    if (!receivers.length) throw new HttpError(400, 'No users match this target');

    await withTransaction(async (q) => {
        for (const r of receivers) {
            await notify(r.id, { category: 'announcement', title, message, method, senderId: req.user.id }, q);
        }
        // A message to one person names that person, so it appears in their history.
        const [only] = receivers.length === 1 ? await q('SELECT id, name FROM users WHERE id = ?', [receivers[0].id]) : [];
        await audit(req, 'notification.sent', { subject: only ?? null, details: { title, count: receivers.length } }, q);
    });
    res.status(201).json({ sent: receivers.length, message: req.t('Notification sent to {count} user(s)', { count: receivers.length }) });
}));

export default router;
