import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { query } from '../db.js';
import { PUBLIC_USER_FIELDS, authenticate, publicUser, signToken } from '../middleware/auth.js';
import { HttpError, ah } from '../utils/http.js';
import { notifyRole } from '../utils/notify.js';
import { isBloodType, parseDate, today } from '../utils/rules.js';
import { PASSWORD_RULE, cleanText, isEmail, isStrongPassword } from '../utils/validate.js';

const router = Router();
const SELF_REGISTER_ROLES = ['donor', 'recipient', 'bloodbank'];

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
        `INSERT INTO users (role, status, name, email, password_hash, phone, blood_type, date_of_birth, region, address, profile)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [role, status, name, email, passwordHash, cleanText(body.phone, 30), body.blood_type || null,
            role === 'donor' ? body.date_of_birth : (parseDate(body.date_of_birth) ? body.date_of_birth : null),
            cleanText(body.region, 80), cleanText(body.address, 200), profile]);

    await notifyRole('admin', {
        category: 'registration',
        title: role === 'bloodbank' ? 'Blood bank awaiting approval' : 'New user registered',
        message: role === 'bloodbank'
            ? `${name} registered as a blood bank and is waiting for your approval.`
            : `${name} registered as a ${role}.`,
    });

    const [user] = await query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [result.insertId]);
    res.status(201).json({
        user: publicUser(user),
        message: status === 'pending'
            ? 'Registration received. The Blood Bank Manager must approve this blood bank before you can log in.'
            : 'Account created. You can now log in.',
    });
}));

router.post('/login', ah(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        throw new HttpError(400, 'Email and password are required');
    }

    const [user] = await query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) throw new HttpError(401, 'Invalid email or password');

    if (user.status === 'pending') throw new HttpError(403, 'Your account is waiting for approval by the Blood Bank Manager');
    if (user.status === 'rejected') throw new HttpError(403, 'Your registration was rejected. Contact the Blood Bank Manager.');
    if (user.status === 'suspended') throw new HttpError(403, 'Your account has been suspended. Contact the Blood Bank Manager.');

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
        if (req.user.role === 'donor' && req.user.verified && body.blood_type !== req.user.blood_type) {
            throw new HttpError(400, 'Blood type is confirmed by the blood bank after a donation and cannot be changed');
        }
        updates.blood_type = body.blood_type || null;
    }
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

    const [user] = await query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
    res.json({ user: publicUser(user), message: 'Profile updated' });
}));

export default router;
