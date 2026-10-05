-- Online Blood Banking System - database schema (MySQL 8 / MariaDB 10.4+)
-- Run with:  npm run db:init   (creates the database named in .env and these tables)
-- Or import manually in phpMyAdmin after creating and selecting a database.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role            ENUM('donor', 'recipient', 'bloodbank', 'admin') NOT NULL,
    status          ENUM('pending', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'approved',
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(160) NOT NULL,
    password_hash   VARCHAR(100) NOT NULL,
    phone           VARCHAR(30) NULL,
    blood_type      ENUM('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+') NULL,
    -- NULL = typed by the donor; set when a blood bank confirms the group on a donation day
    blood_type_confirmed_at DATETIME NULL,
    blood_type_confirmed_by INT UNSIGNED NULL,
    date_of_birth   DATE NULL,
    region          VARCHAR(80) NULL,
    address         VARCHAR(200) NULL,
    verified        TINYINT(1) NOT NULL DEFAULT 0,
    profile         JSON NULL,
    -- sessions (JWTs) issued before this moment are refused, e.g. after a password reset
    password_changed_at DATETIME NULL,
    -- language of the emails sent to the user: the one they last chose in the interface
    language        ENUM('en', 'sw') NOT NULL DEFAULT 'en',
    -- 1 = notifications are also sent to the user's email
    email_notifications TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role_status (role, status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS appointments (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    donor_id          INT UNSIGNED NOT NULL,
    blood_bank_id     INT UNSIGNED NOT NULL,
    blood_type        ENUM('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+') NOT NULL,
    units             INT NOT NULL DEFAULT 1,
    appointment_date  DATE NOT NULL,
    status            ENUM('pending', 'approved', 'completed', 'rejected', 'deferred') NOT NULL DEFAULT 'pending',
    collected_volume_ml SMALLINT UNSIGNED NULL,
    notes             VARCHAR(255) NULL,
    questionnaire     JSON NULL,   -- donor's answers to the health questions when booking
    screening         JSON NULL,   -- blood bank's health check on the donation day
    appeal_id         INT UNSIGNED NULL,   -- donor_appeals.id when booked in answer to an appeal
    rejection_reason  VARCHAR(255) NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_appointments_units CHECK (units > 0),
    CONSTRAINT fk_appointments_donor FOREIGN KEY (donor_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_appointments_bank FOREIGN KEY (blood_bank_id) REFERENCES users (id) ON DELETE CASCADE,
    KEY idx_appointments_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS donations (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    appointment_id  INT UNSIGNED NOT NULL,
    donor_id        INT UNSIGNED NOT NULL,
    blood_bank_id   INT UNSIGNED NOT NULL,
    blood_type      ENUM('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+') NOT NULL,
    units           INT NOT NULL DEFAULT 1,
    volume_ml       SMALLINT UNSIGNED NULL,
    classification  ENUM('standard', 'low_volume') NULL,
    donation_date   DATE NOT NULL,
    expiry_date     DATE NOT NULL,
    reminder_sent_at DATETIME NULL,   -- when the donor was told they may donate again
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_donations_appointment (appointment_id),
    CONSTRAINT chk_donations_units CHECK (units > 0),
    CONSTRAINT fk_donations_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
    CONSTRAINT fk_donations_donor FOREIGN KEY (donor_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_donations_bank FOREIGN KEY (blood_bank_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS blood_stock (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    blood_bank_id  INT UNSIGNED NOT NULL,
    blood_type     ENUM('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+') NOT NULL,
    units          INT NOT NULL DEFAULT 0,
    last_updated   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_stock_bank_type (blood_bank_id, blood_type),
    CONSTRAINT chk_stock_units CHECK (units >= 0),
    CONSTRAINT fk_stock_bank FOREIGN KEY (blood_bank_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS blood_requests (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipient_id      INT UNSIGNED NOT NULL,
    blood_bank_id     INT UNSIGNED NOT NULL,
    blood_type        ENUM('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+') NOT NULL,
    units             INT NOT NULL,
    urgency           ENUM('normal', 'urgent', 'critical') NOT NULL DEFAULT 'normal',
    reason            VARCHAR(255) NULL,
    status            ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    rejection_reason  VARCHAR(255) NULL,
    decided_at        DATETIME NULL,   -- when the bank approved or rejected the request
    -- After approval (like LifeBank in Nigeria): preparing -> ready for collection, or dispatched -> received
    delivery_status   ENUM('preparing', 'ready', 'dispatched', 'received') NULL,
    courier_name      VARCHAR(120) NULL,
    courier_phone     VARCHAR(30) NULL,
    ready_at          DATETIME NULL,
    dispatched_at     DATETIME NULL,
    received_at       DATETIME NULL,
    received_confirmed_by ENUM('recipient', 'bank') NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_requests_units CHECK (units > 0),
    CONSTRAINT fk_requests_recipient FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_requests_bank FOREIGN KEY (blood_bank_id) REFERENCES users (id) ON DELETE CASCADE,
    KEY idx_requests_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- from_bank_id = the bank asking for blood, to_bank_id = the bank asked to supply it.
CREATE TABLE IF NOT EXISTS inter_bank_requests (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    from_bank_id      INT UNSIGNED NOT NULL,
    to_bank_id        INT UNSIGNED NOT NULL,
    blood_type        ENUM('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+') NOT NULL,
    units             INT NOT NULL,
    urgency           ENUM('normal', 'urgent', 'critical') NOT NULL DEFAULT 'normal',
    notes             VARCHAR(255) NULL,
    status            ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    rejection_reason  VARCHAR(255) NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_interbank_units CHECK (units > 0),
    CONSTRAINT fk_interbank_from FOREIGN KEY (from_bank_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_interbank_to FOREIGN KEY (to_bank_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- One row per blood bag (Recommendation 7). blood_stock.units is the number of a bank's
-- 'available' bags of a group that have not passed their expiry date.
CREATE TABLE IF NOT EXISTS blood_units (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    blood_bank_id     INT UNSIGNED NOT NULL,   -- bank holding the bag now
    blood_type        ENUM('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+') NOT NULL,
    source            ENUM('donation', 'received', 'opening') NOT NULL,
    donation_id       INT UNSIGNED NULL,       -- verified donation the bag came from
    classification    ENUM('standard', 'low_volume') NULL,
    collected_on      DATE NOT NULL,
    expiry_date       DATE NOT NULL,
    status            ENUM('available', 'issued', 'expired', 'discarded') NOT NULL DEFAULT 'available',
    blood_request_id  INT UNSIGNED NULL,       -- request the bag was issued for
    transfer_id       INT UNSIGNED NULL,       -- latest inter-bank transfer that moved the bag
    discard_reason    ENUM('damaged', 'cold_chain', 'missing', 'other') NULL,
    discard_notes     VARCHAR(255) NULL,
    expiry_warned_at  DATETIME NULL,
    status_changed_at DATETIME NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_units_bank FOREIGN KEY (blood_bank_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_units_donation FOREIGN KEY (donation_id) REFERENCES donations (id) ON DELETE SET NULL,
    CONSTRAINT fk_units_request FOREIGN KEY (blood_request_id) REFERENCES blood_requests (id) ON DELETE SET NULL,
    CONSTRAINT fk_units_transfer FOREIGN KEY (transfer_id) REFERENCES inter_bank_requests (id) ON DELETE SET NULL,
    KEY idx_units_stock (blood_bank_id, blood_type, status, expiry_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipient_id  INT UNSIGNED NOT NULL,
    sender_id     INT UNSIGNED NULL,
    category      VARCHAR(40) NOT NULL DEFAULT 'general',
    title         VARCHAR(150) NOT NULL,
    message       TEXT NOT NULL,
    params        JSON NULL,
    method        ENUM('in_app', 'email', 'sms') NOT NULL DEFAULT 'in_app',
    is_read       TINYINT(1) NOT NULL DEFAULT 0,
    sent_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- email copy: NULL = not emailed, pending = waiting to be sent (or retried), sent, failed
    email_status  ENUM('pending', 'sent', 'failed') NULL,
    email_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    -- last attempt to send the email; the time it was sent once email_status = 'sent'
    emailed_at    DATETIME NULL,
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE SET NULL,
    KEY idx_notifications_recipient (recipient_id, is_read),
    KEY idx_notifications_email (email_status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- A donor who did not pass the donation-day health check. deferred_until NULL = permanent.
CREATE TABLE IF NOT EXISTS deferrals (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    donor_id        INT UNSIGNED NOT NULL,
    blood_bank_id   INT UNSIGNED NULL,
    appointment_id  INT UNSIGNED NULL,
    reason          ENUM('low_hemoglobin', 'low_weight', 'blood_pressure', 'pulse', 'temperature',
                         'recent_illness', 'medication', 'other_medical') NOT NULL,
    notes           VARCHAR(255) NULL,
    deferred_until  DATE NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_deferrals_donor FOREIGN KEY (donor_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_deferrals_bank FOREIGN KEY (blood_bank_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_deferrals_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE SET NULL,
    KEY idx_deferrals_donor (donor_id, deferred_until)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- A blood bank's urgent call to eligible donors of a blood group (like BISKIT in Nigeria).
CREATE TABLE IF NOT EXISTS donor_appeals (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    blood_bank_id       INT UNSIGNED NOT NULL,
    blood_type          ENUM('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+') NOT NULL,
    include_compatible  TINYINT(1) NOT NULL DEFAULT 0,
    all_regions         TINYINT(1) NOT NULL DEFAULT 0,
    message             VARCHAR(255) NULL,
    status              ENUM('active', 'closed') NOT NULL DEFAULT 'active',
    expires_at          DATE NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appeals_bank FOREIGN KEY (blood_bank_id) REFERENCES users (id) ON DELETE CASCADE,
    KEY idx_appeals_bank_status (blood_bank_id, status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Donors an appeal was sent to.
CREATE TABLE IF NOT EXISTS appeal_recipients (
    appeal_id  INT UNSIGNED NOT NULL,
    donor_id   INT UNSIGNED NOT NULL,
    PRIMARY KEY (appeal_id, donor_id),
    CONSTRAINT fk_recipients_appeal FOREIGN KEY (appeal_id) REFERENCES donor_appeals (id) ON DELETE CASCADE,
    CONSTRAINT fk_recipients_donor FOREIGN KEY (donor_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Single-use links for resetting a forgotten password. Only a SHA-256 hash of each token is
-- stored, so a copy of the database cannot be used to reset anyone's password.
CREATE TABLE IF NOT EXISTS password_resets (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  CHAR(64) NOT NULL,
    expires_at  DATETIME NOT NULL,
    used_at     DATETIME NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_resets_token (token_hash),
    CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Audit trail: who did what, to whom and when (OWASP A09:2021). Rows are only ever added.
-- Names are copied so the record stays readable after an account is deleted.
CREATE TABLE IF NOT EXISTS audit_log (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_id      INT UNSIGNED NULL,       -- NULL = the system (scheduled checks) or an unknown visitor
    actor_name    VARCHAR(120) NULL,
    actor_role    VARCHAR(20) NULL,
    action        VARCHAR(50) NOT NULL,    -- e.g. request.approved (see server/utils/audit.js)
    entity_type   VARCHAR(30) NULL,
    entity_id     INT UNSIGNED NULL,
    subject_id    INT UNSIGNED NULL,       -- the person the action was about, if any
    subject_name  VARCHAR(120) NULL,
    details       JSON NULL,
    ip_address    VARCHAR(45) NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_created (created_at),
    KEY idx_audit_actor (actor_id),
    KEY idx_audit_subject (subject_id),
    KEY idx_audit_action (action)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
