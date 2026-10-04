import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, ah } from '../utils/http.js';

export const PUBLIC_USER_FIELDS =
    `id, role, status, name, email, phone, blood_type, blood_type_confirmed_at,
     (SELECT cb.name FROM users cb WHERE cb.id = users.blood_type_confirmed_by) AS blood_type_confirmed_by_name,
     date_of_birth, region, address, verified, profile, language, email_notifications, created_at`;

export function publicUser(user) {
    if (!user) return user;
    const { password_hash: _hash, ...rest } = user;
    if (typeof rest.profile === 'string') {
        try { rest.profile = JSON.parse(rest.profile); } catch { rest.profile = null; }
    }
    rest.verified = Boolean(rest.verified);
    if ('email_notifications' in rest) rest.email_notifications = Boolean(rest.email_notifications);
    return rest;
}

// Seconds since 1970, as in a JWT's iat. Stored with FROM_UNIXTIME so the comparison below does not
// depend on the time zones of the API and database servers.
export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function signToken(user) {
    return jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Checks the JWT and reloads the user so suspended accounts lose access immediately,
// and sessions opened before the last password change or reset end.
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

    const [row] = await query(
        `SELECT ${PUBLIC_USER_FIELDS}, UNIX_TIMESTAMP(password_changed_at) AS password_changed FROM users WHERE id = ?`, [payload.id]);
    if (!row || row.status !== 'approved') throw new HttpError(401, 'This account is not active');
    const { password_changed: changed, ...user } = row;
    if (changed && payload.iat < Number(changed)) throw new HttpError(401, 'Your password was changed. Please log in again.');
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
