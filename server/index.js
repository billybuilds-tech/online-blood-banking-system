import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

if (!process.env.JWT_SECRET) {
    console.warn('Warning: JWT_SECRET is not set. Copy .env.example to .env and set a long random secret.');
}

try {
    await pool.query('SELECT 1');
    console.log(`Connected to MySQL database "${config.db.database}"`);
} catch (err) {
    console.error(`Could not connect to MySQL: ${err.message}`);
    console.error('Check that MySQL is running and that the values in server/.env are correct.');
}

app.listen(config.port, () => {
    console.log(`Online Blood Banking System API running on http://localhost:${config.port}`);
});
