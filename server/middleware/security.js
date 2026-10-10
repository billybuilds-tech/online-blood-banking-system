import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

export function authLimiter({ limit = config.production ? 20 : 500, windowMs = 15 * 60 * 1000 } = {}) {
    return rateLimit({
        windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
        message: { error: 'Too many attempts. Please wait before trying again.' },
    });
}
