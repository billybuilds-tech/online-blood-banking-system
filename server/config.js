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
    // 450 mL collection bag: 450 mL +/- 10% is a standard unit; 300-404 mL is a
    // low-volume unit (red cells only); less is an incomplete collection (Roback et al., 2011).
    BAG_VOLUME_ML: 450,
    STANDARD_MIN_ML: 405,
    STANDARD_MAX_ML: 495,
    LOW_VOLUME_MIN_ML: 300,
};

/*
 * Donation-day health check (WHO, 2012: donor selection is repeated at every donation).
 * A value outside these limits stops the collection and the donor is deferred.
 * Prototype values: confirm each limit with NBTS before real use.
 */
export const SCREENING_LIMITS = {
    MIN_WEIGHT_KG: 50,
    MIN_HEMOGLOBIN_G_DL: 12.5,
    SYSTOLIC_MM_HG: [90, 180],
    DIASTOLIC_MM_HG: [50, 100],
    PULSE_BPM: [50, 100],
    MAX_TEMPERATURE_C: 37.5,
};

