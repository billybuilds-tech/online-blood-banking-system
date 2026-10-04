import { query } from '../db.js';
import { translate, translateNotification } from './i18n.js';
import { appLink, mailerReady, sendMail } from './mailer.js';
import { onEmailQueued } from './notify.js';

/*
 * Email copies of notifications. notify() marks a notification 'pending' when it should be emailed
 * (utils/notify.js); this module sends pending ones in the receiver's language. Because the queue
 * is kept in the database, emails waiting when the API stops are sent when it starts again.
 * A failed email is tried again after 5, 10, 15 and 20 minutes, then marked 'failed'.
 */
const BATCH = 20;
const MAX_ATTEMPTS = 5;
const RETRY_STEP_MINUTES = 5;
const CHECK_INTERVAL_MS = 60 * 1000;

const EMAIL_TEXT = `Hello {name},

{message}

Open the Online Blood Banking System: {link}

You receive this email because email notifications are on in your profile. You can turn them off there.`;
const FOOTER = 'You receive this email because email notifications are on in your profile. You can turn them off there.';

const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// The email for one notification row joined with its receiver (name, email, language).
export function composeEmail(row) {
    const lang = row.language === 'sw' ? 'sw' : 'en';
    const t = (text, vars) => translate(lang, text, vars);
    const { title, message } = translateNotification(lang, row);
    const link = appLink('/dashboard');
    const system = t('Online Blood Banking System');
    const html = `<!doctype html>
<html lang="${lang}"><body style="margin:0;padding:24px 12px;background:#f6f1f0;font-family:Arial,Helvetica,sans-serif;color:#2b2221">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #eadfdd">
<div style="background:#a51d24;color:#ffffff;padding:14px 22px;font-size:15px;font-weight:bold">${escapeHtml(system)}</div>
<div style="padding:22px;font-size:15px;line-height:1.55">
<p style="margin:0 0 14px">${escapeHtml(t('Hello {name},', { name: row.name }))}</p>
<h1 style="margin:0 0 10px;font-size:18px;color:#a51d24">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;white-space:pre-line">${escapeHtml(message)}</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#a51d24;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">${escapeHtml(t('Open the system'))}</a>
</div>
<div style="padding:14px 22px;background:#faf6f5;font-size:12px;color:#7a6e6c">${escapeHtml(t(FOOTER))}</div>
</div></body></html>`;
    return {
        to: row.email,
        subject: title,
        text: t(EMAIL_TEXT, { name: row.name, message, link }),
        html,
    };
}

// Errors about one address (the server refused that recipient); any other error, such as a wrong
// password or no connection, would fail every email, so the run stops and tries again later.
const RECIPIENT_ERRORS = new Set(['EENVELOPE']);

let running = false;
let again = false;

// Sends every pending email that is due. Returns how many were sent.
export async function sendPendingEmails() {
    if (!mailerReady()) return 0;
    if (running) {
        again = true;
        return 0;
    }
    running = true;
    let sent = 0;
    let stop = false;
    try {
        do {
            again = false;
            let lastId = 0;
            while (!stop) {
                const rows = await query(
                    `SELECT n.id, n.category, n.title, n.message, n.params, n.email_attempts, u.name, u.email, u.language
                     FROM notifications n JOIN users u ON u.id = n.recipient_id
                     WHERE n.email_status = 'pending' AND n.id > ?
                       AND (n.emailed_at IS NULL OR n.emailed_at <= NOW() - INTERVAL (? * n.email_attempts) MINUTE)
                     ORDER BY n.id LIMIT ?`,
                    [lastId, RETRY_STEP_MINUTES, BATCH]);
                if (!rows.length) break;
                for (const row of rows) {
                    lastId = row.id;
                    try {
                        await sendMail(composeEmail(row));
                        await query("UPDATE notifications SET email_status = 'sent', email_attempts = email_attempts + 1, emailed_at = NOW() WHERE id = ?", [row.id]);
                        sent += 1;
                    } catch (err) {
                        const status = row.email_attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
                        await query('UPDATE notifications SET email_status = ?, email_attempts = email_attempts + 1, emailed_at = NOW() WHERE id = ?', [status, row.id]);
                        console.error(`Email to ${row.email} failed: ${err.message}`);
                        if (!RECIPIENT_ERRORS.has(err.code)) {
                            stop = true;
                            break;
                        }
                    }
                }
            }
        } while (again && !stop);
    } finally {
        running = false;
    }
    return sent;
}

// Sends waiting emails now and whenever a notification is emailed, and checks every minute for retries.
export function startEmailOutbox() {
    if (!mailerReady()) return;
    const run = () => sendPendingEmails().catch((err) => console.error(`Sending emails failed: ${err.message}`));
    onEmailQueued(run);
    run();
    setInterval(run, CHECK_INTERVAL_MS).unref();
}
