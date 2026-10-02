import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { PUBLIC_USER_FIELDS, authenticate, publicUser, requireRole } from '../middleware/auth.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { disconnect } from '../utils/live.js';
import { notify } from '../utils/notify.js';
import { initialiseStock } from '../utils/stock.js';
import { cleanText } from '../utils/validate.js';

const router = Router();
router.use(authenticate);

const ROLES = ['donor', 'recipient', 'bloodbank', 'admin'];
const STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

const STATUS_NOTICE = {
    approved: { title: 'Account approved', message: 'Your account has been approved. You can now use the system.' },
    rejected: { title: 'Account rejected', message: 'Your registration was not approved. Contact the Blood Bank Manager for details.' },
    suspended: { title: 'Account suspended', message: 'Your account has been suspended by the Blood Bank Manager.' },
    pending: { title: 'Account pending', message: 'Your account has been set back to pending review.' },
};

/*
 * Blood Bank Manager: any users, any status.
 * Blood bank: approved donors and recipients.
 * Everyone: approved blood banks (contact details only).
 */
router.get('/', ah(async (req, res) => {
    const { role, status } = req.query;
    const search = cleanText(req.query.search, 100);
    if (role && !ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
    if (status && !STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');

    const where = [];
    const params = [];
    let fields = PUBLIC_USER_FIELDS;

    if (req.user.role === 'admin') {
        if (role) { where.push('role = ?'); params.push(role); }
        if (status) { where.push('status = ?'); params.push(status); }
    } else if (role === 'bloodbank') {
        fields = 'id, name, email, phone, region, address';
        where.push("role = 'bloodbank'", "status = 'approved'");
    } else if (req.user.role === 'bloodbank' && (role === 'donor' || role === 'recipient')) {
        fields = 'id, role, name, email, phone, blood_type, date_of_birth, region, verified';
        where.push('role = ?', "status = 'approved'");
        params.push(role);
    } else {
        throw new HttpError(403, 'You do not have permission to list these users');
    }

    if (search) {
        where.push('(name LIKE ? OR email LIKE ? OR region LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const rows = await query(
        `SELECT ${fields} FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`,
        params);
    res.json(rows.map(publicUser));
}));

router.patch('/:id/status', requireRole('admin'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { status } = req.body ?? {};
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Status must be pending, approved, rejected or suspended');
    if (id === req.user.id) throw new HttpError(400, 'You cannot change the status of your own account');

    const user = await withTransaction(async (q) => {
        const [target] = await q('SELECT id, role, name, status FROM users WHERE id = ? FOR UPDATE', [id]);
        if (!target) throw new HttpError(404, 'User not found');

        await q('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        if (target.role === 'bloodbank' && status === 'approved') {
            await q('UPDATE users SET verified = 1 WHERE id = ?', [id]);
            await initialiseStock(q, id);
        }

        await notify(id, { category: 'approval', ...STATUS_NOTICE[status], senderId: req.user.id }, q);

        const [updated] = await q(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [id]);
        return updated;
    });

    if (status !== 'approved') disconnect(id);
    res.json({ user: publicUser(user), message: req.t('{name}: {status}', { name: user.name, status }) });
}));

router.delete('/:id', requireRole('admin'), ah(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
    const result = await query('DELETE FROM users WHERE id = ?', [id]);
    if (!result.affectedRows) throw new HttpError(404, 'User not found');
    disconnect(id);
    res.json({ message: req.t('User deleted') });
}));

export default router;
