import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import helmet from 'helmet';
import { authLimiter } from './middleware/security.js';
import { config } from './config.js';
import { query } from './db.js';
import appealRoutes from './routes/appeals.js';
import appointmentRoutes from './routes/appointments.js';
import auditRoutes from './routes/audit.js';
import authRoutes from './routes/auth.js';
import campaignRoutes from './routes/campaigns.js';
import bloodRequestRoutes from './routes/bloodRequests.js';
import donationRoutes from './routes/donations.js';
import donorRoutes from './routes/donors.js';
import interBankRoutes from './routes/interBankRequests.js';
import notificationRoutes from './routes/notifications.js';
import publicRoutes from './routes/public.js';
import reportRoutes from './routes/reports.js';
import stockRoutes from './routes/stock.js';
import userRoutes from './routes/users.js';
import { HttpError } from './utils/http.js';
import { language, translate } from './utils/i18n.js';

export const app = express();

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet());
const origins = config.clientOrigin.split(',').map((o) => o.trim());
app.use(cors({ origin: origins, credentials: true }));
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.headers.origin && !origins.includes(req.headers.origin))
        return next(new HttpError(403, 'This request is not allowed'));
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
        return next(new HttpError(415, 'Send requests as application/json'));
    next();
});
app.use(express.json({ limit: '100kb' }));
app.use(language);
app.use(cookieParser(config.jwtSecret));
app.use(csrf({
    cookie: {
        key: config.production ? '__Host-obbs_csrf' : 'obbs_csrf', signed: true,
        httpOnly: true, secure: config.production, sameSite: 'strict', path: '/',
    },
    value: (req) => req.get('X-CSRF-Token'),
}));
app.get('/api/csrf-token', (req, res) => res.json({ token: req.csrfToken() }));
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password'], authLimiter());

app.get('/api/health', async (_req, res) => {
    try {
        await query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
    } catch {
        res.status(503).json({ status: 'error', database: 'disconnected' });
    }
});

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/blood-requests', bloodRequestRoutes);
app.use('/api/inter-bank-requests', interBankRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/appeals', appealRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/audit', auditRoutes);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    if (res.headersSent) return;
    const lang = req.lang || 'en';
    const reply = (status, message, vars, details = {}) =>
        res.status(status).json({ error: translate(lang, message, vars), ...details });

    if (err.code === 'EBADCSRFTOKEN')
        return reply(403, 'Your request expired. Please try again.', undefined, { code: 'CSRF_TOKEN_INVALID' });

    if (err instanceof HttpError) {
        const { shortage: _s, ...details } = err.details || {};
        return reply(err.status, err.message, err.vars, details);
    }
    if (err.type === 'entity.parse.failed') return reply(400, 'Invalid JSON body');
    if (err.type === 'entity.too.large') return reply(413, 'Request body is too large');
    if (err.code === 'ER_DUP_ENTRY') return reply(409, 'This record already exists');
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.errno === 4025) {
        return reply(409, 'The change would make stock negative');
    }
    console.error(err);
    reply(500, 'Something went wrong on the server');
});
