import nodemailer from 'nodemailer';
import { config } from '../config.js';

// pool: one SMTP connection is reused for many messages, e.g. an announcement to every donor.
const transport = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        requireTLS: config.production,
        disableFileAccess: true,
        disableUrlAccess: true,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
        pool: true,
    })
    : null;

// True when an email account is set in server/.env, so email can really be sent.
export function mailerReady() {
    return Boolean(transport);
}

// Names reserved for tests and examples (RFC 2606, RFC 6761) and .local, used by the demo and test
// accounts. Mail to them could never arrive, so it is not sent.
const UNDELIVERABLE = /(\.(local|test|example|invalid|localhost)|[@.]example\.(com|net|org))$/i;

export function isDeliverable(email) {
    return typeof email === 'string' && email.includes('@') && !UNDELIVERABLE.test(email.trim());
}

// Address of the web application, for links in emails.
export function appLink(path = '') {
    return `${config.clientOrigin.split(',')[0].trim()}${path}`;
}

/*
 * Sends an email (plain text, and HTML when given) through the account in server/.env (SMTP_*).
 * Without a deliverable SMTP account, return false without logging confidential message content.
 */
export async function sendMail({ to, subject, text, html }) {
    if (!transport || !isDeliverable(to)) {
        return false;
    }
    await transport.sendMail({ from: config.smtp.from, to, subject, text, ...(html ? { html } : {}) });
    return true;
}
