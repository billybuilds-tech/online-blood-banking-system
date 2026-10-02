import 'dotenv/config';

export const config = {
    port: Number(process.env.PORT) || 5000,
    clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
    jwtExpiresIn: '8h',
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'obbs',
    },
};

/*
 * Blood-banking rules used by the server (Section 4.5 of the report).
 * These are prototype values and must be confirmed against current NBTS guidance
 * before the system is used in practice.
 */
export const RULES = {
    MIN_DONOR_AGE: 18,
    MAX_DONOR_AGE: 65,
    MIN_DAYS_BETWEEN_DONATIONS: 90,
    SHELF_LIFE_DAYS: 35,
    LOW_STOCK_THRESHOLD: 5,
    MAX_UNITS_PER_REQUEST: 20,
    UNITS_PER_DONATION: 1,
};
