import nodemailer from 'nodemailer';
import { config } from '../config.js';

const transport = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    })
    : null;

/*
 * Sends a plain-text email through the account in server/.env (SMTP_*). When no account is set,
 * as on a development computer, the message is printed in the API window instead, so the
 * system still works for demonstrations. Returns true when the email was handed to the server.
 */
export async function sendMail({ to, subject, text }) {
    if (!transport) {
        console.log(`\n----- Email (no email account is set, so it is shown here) -----\nTo: ${to}\nSubject: ${subject}\n\n${text}\n-----\n`);
        return false;
    }
    await transport.sendMail({ from: config.smtp.from, to, subject, text });
    return true;
}
