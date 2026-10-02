import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { query } from './db.js';
import appointmentRoutes from './routes/appointments.js';
import authRoutes from './routes/auth.js';
import bloodRequestRoutes from './routes/bloodRequests.js';
import donationRoutes from './routes/donations.js';
import interBankRoutes from './routes/interBankRequests.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import stockRoutes from './routes/stock.js';
import userRoutes from './routes/users.js';
import { HttpError } from './utils/http.js';

export const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: config.clientOrigin.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));

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

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
        const { shortage: _s, ...details } = err.details || {};
        return res.status(err.status).json({ error: err.message, ...details });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This record already exists' });
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.errno === 4025) {
        return res.status(409).json({ error: 'The change would make stock negative' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
});
