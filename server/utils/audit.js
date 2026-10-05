import { query } from '../db.js';

/*
 * Audit trail (OWASP A09:2021, Security Logging and Monitoring): every important action is
 * recorded with who did it, to whom, when and from which address. The text of each action is an
 * English template filled from details, shown in the reader's language like notifications.
 */
export const AUDIT_ACTIONS = {
    // Accounts and logins
    'auth.register': 'Registered as {role}',
    'auth.login': 'Logged in',
    'auth.login_failed': 'Failed login attempt for {email}',
    'auth.login_blocked': 'Login refused: account {status}',
    'auth.password_changed': 'Changed their password',
    'auth.password_reset_requested': 'A password reset link was requested for {email}',
    'auth.password_reset': 'Reset their password with an emailed link',
    'user.status': 'Set the account of {name} to {status}',
    'user.deleted': 'Deleted the account of {name} ({role})',
    // Donations
    'appointment.booked': 'Booked a donation at {bank} for {date}',
    'appointment.approved': 'Approved the donation appointment of {name} for {date}',
    'appointment.rejected': 'Rejected the donation appointment of {name} for {date}',
    'donation.verified': 'Verified a donation from {name}: {volume} mL of {bloodType}, bag {unit}',
    'donation.incomplete': 'Recorded an incomplete collection from {name}: {volume} mL',
    'donor.deferred': 'Deferred {name} until {until}: {reason}',
    'donor.deferred_permanently': 'Deferred {name} permanently: {reason}',
    // Blood requests and transfers
    'request.created': 'Requested {units} unit(s) of {bloodType} from {bank} ({urgency})',
    'request.approved': 'Approved the request of {name} for {units} unit(s) of {bloodType}; bags {bags}',
    'request.rejected': 'Rejected the request of {name} for {units} unit(s) of {bloodType}',
    'request.ready': 'Made {units} unit(s) of {bloodType} ready for collection by {name}',
    'request.dispatched': 'Sent {units} unit(s) of {bloodType} to {name} with {courier}',
    'request.received': 'Recorded that {name} received {units} unit(s) of {bloodType} from {bank}',
    'transfer.requested': 'Asked {bank} for {units} unit(s) of {bloodType}',
    'transfer.approved': 'Supplied {units} unit(s) of {bloodType} to {bank}; bags {bags}',
    'transfer.rejected': 'Declined the request of {bank} for {units} unit(s) of {bloodType}',
    // Stock
    'stock.received': 'Received {units} bag(s) of {bloodType} collected on {date}',
    'stock.discarded': 'Discarded bag {unit} ({bloodType}): {reason}',
    'stock.expired': 'Removed {units} expired bag(s) of {bloodType} at {bank}',
    // Appeals and messages
    'appeal.sent': 'Sent an urgent appeal for {bloodType} to {count} donor(s)',
    'appeal.closed': 'Closed the appeal for {bloodType}',
    'notification.sent': 'Sent the message "{title}" to {count} user(s)',
    // System
    'system.reminders': 'Ran the eligibility reminders: {count} sent',
    'system.expiry_check': 'Ran the expiry check: {expired} bag(s) removed, {warned} warning(s) sent',
};

// Groups for the manager's filter: each lists the action prefixes it covers.
export const AUDIT_CATEGORIES = {
    accounts: ['auth.', 'user.'],
    donations: ['appointment.', 'donation.', 'donor.'],
    requests: ['request.', 'transfer.'],
    stock: ['stock.'],
    messages: ['appeal.', 'notification.'],
    system: ['system.'],
};

/*
 * Adds one row. req supplies the actor (the logged-in user) and the address; pass actor when the
 * user is not logged in yet (registration, login) and req = null for scheduled system work.
 * subject is the person the action was about. Inside a transaction pass q, so a change that is
 * rolled back is not recorded as done.
 */
export async function audit(req, action, { actor = req?.user ?? null, entityType = null, entityId = null, subject = null, details = null } = {}, q = query) {
    if (!AUDIT_ACTIONS[action]) throw new Error(`Unknown audit action ${action}`);
    await q(
        `INSERT INTO audit_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, subject_id, subject_name, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [actor?.id ?? null, actor?.name ?? null, actor?.role ?? null, action, entityType, entityId,
            subject?.id ?? null, subject?.name ?? null, details ? JSON.stringify(details) : null, req?.ip ?? null]);
}
