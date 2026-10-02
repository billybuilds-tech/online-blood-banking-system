import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, ah } from '../utils/http.js';

export const PUBLIC_USER_FIELDS =
    'id, role, status, name, email, phone, blood_type, date_of_birth, region, address, verified, profile, created_at';

export function publicUser(user) {
    if (!user) return user;
    const { password_hash: _hash, ...rest } = user;
    if (typeof rest.profile === 'string') {
        try { rest.profile = JSON.parse(rest.profile); } catch { rest.profile = null; }
    }
    rest.verified = Boolean(rest.verified);
    return rest;
}

export function signToken(user) {
    return jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Checks the JWT and reloads the user so suspended accounts lose access immediately.
export const authenticate = ah(async (req, _res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Login required');

    let payload;
    try {
        payload = jwt.verify(token, config.jwtSecret);
    } catch {
        throw new HttpError(401, 'Invalid or expired session. Please log in again.');
    }

    const [user] = await query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [payload.id]);
    if (!user || user.status !== 'approved') throw new HttpError(401, 'This account is not active');
    req.user = publicUser(user);
    next();
});

export function requireRole(...roles) {
    return (req, _res, next) => {
        if (!roles.includes(req.user?.role)) {
            return next(new HttpError(403, 'You do not have permission for this action'));
        }
        next();
    };
}
