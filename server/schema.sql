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
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE SET NULL,
    KEY idx_notifications_recipient (recipient_id, is_read)
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

SET FOREIGN_KEY_CHECKS = 1;
