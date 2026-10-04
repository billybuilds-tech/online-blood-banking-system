import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { PUBLIC_USER_FIELDS, authenticate, nowSeconds, publicUser, signToken } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { HttpError, ah } from '../utils/http.js';
import { disconnect } from '../utils/live.js';
import { appLink, sendMail } from '../utils/mailer.js';
import { notify, notifyRole } from '../utils/notify.js';
import { isBloodType, parseDate, today } from '../utils/rules.js';
import { PASSWORD_RULE, cleanText, isEmail, isStrongPassword } from '../utils/validate.js';

const router = Router();
const SELF_REGISTER_ROLES = ['donor', 'recipient', 'bloodbank'];

const REGISTRATION_NOTICE = {
    bloodbank: { title: 'Blood bank awaiting approval', message: '{name} registered as a blood bank and is waiting for your approval.' },
    donor: { title: 'New user registered', message: '{name} registered as a donor.' },
    recipient: { title: 'New user registered', message: '{name} registered as a recipient.' },
};

router.post('/register', ah(async (req, res) => {
    const body = req.body ?? {};
    const role = body.role;
    const name = cleanText(body.name, 120);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!SELF_REGISTER_ROLES.includes(role)) throw new HttpError(400, 'Role must be donor, recipient or bloodbank');
    if (!name) throw new HttpError(400, 'Name is required');
    if (!isEmail(email)) throw new HttpError(400, 'A valid email address is required');
    if (!isStrongPassword(body.password)) throw new HttpError(400, PASSWORD_RULE);
    if (body.blood_type && !isBloodType(body.blood_type)) throw new HttpError(400, 'Invalid blood type');

    if (role === 'donor') {
        if (!body.blood_type) throw new HttpError(400, 'Blood type is required for donors');
        if (!parseDate(body.date_of_birth) || body.date_of_birth >= today()) {
            throw new HttpError(400, 'A valid date of birth is required for donors');
        }
    }
    if (role === 'bloodbank' && !cleanText(body.region)) throw new HttpError(400, 'Region is required for blood banks');

    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) throw new HttpError(409, 'An account with this email already exists');

    const passwordHash = await bcrypt.hash(body.password, 10);
    const status = role === 'bloodbank' ? 'pending' : 'approved';
    const profile = role === 'bloodbank' && body.license_number
        ? JSON.stringify({ license_number: cleanText(body.license_number, 60) })
        : null;

    const result = await query(
        `INSERT INTO users (role, status, name, email, password_hash, phone, blood_type, date_of_birth, region, address, profile, language)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [role, status, name, email, passwordHash, cleanText(body.phone, 30), body.blood_type || null,
            role === 'donor' ? body.date_of_birth : (parseDate(body.date_of_birth) ? body.date_of_birth : null),
            cleanText(body.region, 80), cleanText(body.address, 200), profile, req.lang]);

    await notifyRole('admin', { category: 'registration', ...REGISTRATION_NOTICE[role], vars: { name } });
    await audit(req, 'auth.register', {
        actor: { id: result.insertId, name, role }, entityType: 'user', entityId: result.insertId, details: { role },
    });

    const [user] = await query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [result.insertId]);
    res.status(201).json({
        user: publicUser(user),
        message: req.t(status === 'pending'
            ? 'Registration received. The Blood Bank Manager must approve this blood bank before you can log in.'
            : 'Account created. You can now log in.'),
    });
}));

const BLOCKED = {
    pending: 'Your account is waiting for approval by the Blood Bank Manager',
    rejected: 'Your registration was rejected. Contact the Blood Bank Manager.',
    suspended: 'Your account has been suspended. Contact the Blood Bank Manager.',
};

router.post('/login', ah(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        throw new HttpError(400, 'Email and password are required');
    }

    const [user] = await query(`SELECT ${PUBLIC_USER_FIELDS}, password_hash FROM users WHERE email = ?`, [email.trim().toLowerCase()]);
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
        // Recorded so the manager can see repeated attempts against an account.
        await audit(req, 'auth.login_failed', { actor: null, subject: user ?? null, details: { email: cleanText(email, 160) } });
        throw new HttpError(401, 'Invalid email or password');
    }

    if (BLOCKED[user.status]) {
        await audit(req, 'auth.login_blocked', { actor: user, details: { status: user.status } });
        throw new HttpError(403, BLOCKED[user.status]);
    }

    // Emails to the user are written in the language they log in with.
    if (user.language !== req.lang) {
        await query('UPDATE users SET language = ? WHERE id = ?', [req.lang, user.id]);
        user.language = req.lang;
    }
    await audit(req, 'auth.login', { actor: user });
    res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

router.put('/me', authenticate, ah(async (req, res) => {
    const body = req.body ?? {};
    const updates = {};

    if (body.name !== undefined) {
        const name = cleanText(body.name, 120);
        if (!name) throw new HttpError(400, 'Name cannot be empty');
        updates.name = name;
    }
    if (body.phone !== undefined) updates.phone = cleanText(body.phone, 30);
    if (body.region !== undefined) updates.region = cleanText(body.region, 80);
    if (body.address !== undefined) updates.address = cleanText(body.address, 200);
    if (body.blood_type !== undefined && req.user.role !== 'bloodbank' && req.user.role !== 'admin') {
        if (body.blood_type && !isBloodType(body.blood_type)) throw new HttpError(400, 'Invalid blood type');
        if (req.user.role === 'donor' && req.user.blood_type_confirmed_at && body.blood_type !== req.user.blood_type) {
            throw new HttpError(400, 'Blood type is confirmed by the blood bank after a donation and cannot be changed');
        }
        updates.blood_type = body.blood_type || null;
    }
    if (body.language !== undefined) {
        if (!['en', 'sw'].includes(body.language)) throw new HttpError(400, 'Language must be en or sw');
        updates.language = body.language;
    }
    if (body.email_notifications !== undefined) updates.email_notifications = body.email_notifications ? 1 : 0;
    if (body.date_of_birth !== undefined && req.user.role !== 'bloodbank') {
        if (!parseDate(body.date_of_birth) || body.date_of_birth >= today()) throw new HttpError(400, 'Invalid date of birth');
        updates.date_of_birth = body.date_of_birth;
    }

    if (body.newPassword) {
        if (!isStrongPassword(body.newPassword)) throw new HttpError(400, PASSWORD_RULE);
        const [row] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        const valid = typeof body.currentPassword === 'string' && await bcrypt.compare(body.currentPassword, row.password_hash);
        if (!valid) throw new HttpError(400, 'Current password is incorrect');
        updates.password_hash = await bcrypt.hash(body.newPassword, 10);
    }

    const columns = Object.keys(updates);
    if (columns.length) {
        await query(
            `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
            [...columns.map((c) => updates[c]), req.user.id]);
    }

    if (body.newPassword) {
        // Other sessions of this account end; this one continues with the new token below.
        await query('UPDATE users SET password_changed_at = FROM_UNIXTIME(?) WHERE id = ?', [nowSeconds(), req.user.id]);
        await audit(req, 'auth.password_changed');
    }

    const [user] = await query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
    res.json({
        user: publicUser(user),
        ...(body.newPassword ? { token: signToken(user) } : {}),
        message: req.t(body.newPassword ? 'Password changed' : 'Profile updated'),
    });
}));

/* ---------- Forgotten password: a single-use link sent by email ---------- */

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const RESET_SENT = 'If an account exists for this email, a link to reset the password has been sent to it. The link works once, for {minutes} minutes.';
const RESET_INVALID = 'This reset link is invalid, already used or expired. Ask for a new one.';
const RESET_EMAIL = `Hello {name},

We received a request to reset the password of your Online Blood Banking System account. Open this link to choose a new password:

{link}

The link works once, for {minutes} minutes. If you did not ask for this, ignore this email; your password stays the same.`;

/*
 * Step 1. The reply is the same whether or not the email has an account, and the email is sent
 * after replying, so neither the message nor the response time shows who is registered.
 */
router.post('/forgot-password', ah(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!isEmail(email)) throw new HttpError(400, 'A valid email address is required');
    const minutes = config.passwordResetMinutes;
    res.json({ message: req.t(RESET_SENT, { minutes }) });

    try {
        const [user] = await query('SELECT id, name, email FROM users WHERE email = ?', [email]);
        if (!user) return;
        // At most one link every 2 minutes per account, so the form cannot flood a mailbox.
        const [recent] = await query('SELECT id FROM password_resets WHERE user_id = ? AND created_at > NOW() - INTERVAL 2 MINUTE', [user.id]);
        if (recent) return;

        const token = crypto.randomBytes(32).toString('base64url');
        await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)',
            [user.id, hashToken(token), minutes]);
        await audit(req, 'auth.password_reset_requested', { actor: null, subject: user, details: { email } });
        const link = appLink(`/reset-password?token=${token}`);
        await sendMail({ to: user.email, subject: req.t('Reset your password'), text: req.t(RESET_EMAIL, { name: user.name, link, minutes }) });
    } catch (err) {
        console.error(`Password reset email failed: ${err.message}`);
    }
}));

// Step 2. A valid, unused, unexpired link sets the new password and ends every open session.
router.post('/reset-password', ah(async (req, res) => {
    const { token, password } = req.body ?? {};
    if (typeof token !== 'string' || !token) throw new HttpError(400, RESET_INVALID);
    if (!isStrongPassword(password)) throw new HttpError(400, PASSWORD_RULE);
    const passwordHash = await bcrypt.hash(password, 10);

    const userId = await withTransaction(async (q) => {
        const [reset] = await q(
            `SELECT r.user_id, u.name, u.role FROM password_resets r JOIN users u ON u.id = r.user_id
             WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > NOW() FOR UPDATE`,
            [hashToken(token)]);
        if (!reset) throw new HttpError(400, RESET_INVALID);
        await q('UPDATE users SET password_hash = ?, password_changed_at = FROM_UNIXTIME(?) WHERE id = ?',
            [passwordHash, nowSeconds(), reset.user_id]);
        // This link and any other open link for the account stop working.
        await q('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [reset.user_id]);
        await notify(reset.user_id, {
            category: 'security',
            title: 'Your password was changed',
            message: 'Your password was reset with a link sent to your email. If this was not you, contact the Blood Bank Manager at once.',
        }, q);
        await audit(req, 'auth.password_reset', { actor: { id: reset.user_id, name: reset.name, role: reset.role } }, q);
        return reset.user_id;
    });
    disconnect(userId);
    res.json({ message: req.t('Your password has been reset. You can now log in with the new password.') });
}));

export default router;
