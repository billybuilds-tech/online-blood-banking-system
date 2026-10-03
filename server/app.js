import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { query } from './db.js';
import appealRoutes from './routes/appeals.js';
import appointmentRoutes from './routes/appointments.js';
import authRoutes from './routes/auth.js';
import bloodRequestRoutes from './routes/bloodRequests.js';
import donationRoutes from './routes/donations.js';
import donorRoutes from './routes/donors.js';
import interBankRoutes from './routes/interBankRequests.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import stockRoutes from './routes/stock.js';
import userRoutes from './routes/users.js';
import { HttpError } from './utils/http.js';
import { language, translate } from './utils/i18n.js';

export const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: config.clientOrigin.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));
app.use(language);

app.get('/api/health', async (_req, res) => {
    try {
        await query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
    } catch {
        res.status(503).json({ status: 'error', database: 'disconnected' });
    }
});

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
app.use('/api/donors', donorRoutes);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    const lang = req.lang || 'en';
    const reply = (status, message, vars, details = {}) =>
        res.status(status).json({ error: translate(lang, message, vars), ...details });

    if (err instanceof HttpError) {
        const { shortage: _s, ...details } = err.details || {};
        return reply(err.status, err.message, err.vars, details);
    }
    if (err.type === 'entity.parse.failed') return reply(400, 'Invalid JSON body');
    if (err.code === 'ER_DUP_ENTRY') return reply(409, 'This record already exists');
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.errno === 4025) {
        return reply(409, 'The change would make stock negative');
    }
    console.error(err);
    reply(500, 'Something went wrong on the server');
});
