import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { notify } from '../utils/notify.js';
import { cleanText } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', ah(async (req, res) => {
    const rows = await query(
        `SELECT n.id, n.category, n.title, n.message, n.method, n.is_read, n.sent_at, s.name AS sender_name
         FROM notifications n LEFT JOIN users s ON s.id = n.sender_id
         WHERE n.recipient_id = ?
         ORDER BY n.sent_at DESC, n.id DESC
         LIMIT 100`,
        [req.user.id]);
    const notifications = rows.map((r) => ({ ...r, is_read: Boolean(r.is_read) }));
    res.json({ notifications, unread: notifications.filter((n) => !n.is_read).length });
}));

router.patch('/read-all', ah(async (req, res) => {
    await query('UPDATE notifications SET is_read = 1 WHERE recipient_id = ?', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
}));

router.patch('/:id/read', ah(async (req, res) => {
    const id = parseId(req.params.id);
    const result = await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?', [id, req.user.id]);
    if (!result.affectedRows) throw new HttpError(404, 'Notification not found');
    res.json({ message: 'Notification marked as read' });
}));

/*
 * Blood Bank Manager sends a message to one user, a list of users, a whole role, or everyone.
 * Email and SMS are recorded as the delivery method; no gateway is connected (Section 1.7).
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
    });
    res.status(201).json({ sent: receivers.length, message: `Notification sent to ${receivers.length} user(s)` });
}));

export default router;
