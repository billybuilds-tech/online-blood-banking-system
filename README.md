# Online Blood Banking System

Final Year Project — BSc Information Technology, Institute of Finance Management (2025/2026).

A web platform that connects **donors**, **recipients**, **blood banks** and the **Blood Bank Manager (admin)**.
React 19 + Vite frontend, Node.js/Express REST API, MySQL database.

## Requirements

- Node.js 20 or newer — https://nodejs.org
- MySQL 8 or MariaDB (XAMPP works: start **MySQL** in the XAMPP Control Panel)

## Quick start (Windows + XAMPP)

Double-click **`start.bat`**. It starts MySQL, installs dependencies and prepares the database
the first time, starts the API and the frontend in their own windows, and opens
http://localhost:5173. Close the two windows to stop the system.

## Manual setup

```bash
# 1. Backend
cd server
npm install
copy .env.example .env        # (already created; edit DB_PASSWORD etc. if needed)
npm run db:init               # creates the database and the 7 tables
npm run create-admin          # creates the Blood Bank Manager account from .env
npm run seed:demo             # optional: demo banks, donors, recipient and stock
npm run seed:history          # optional: a year of demo history for the charts (after seed:demo)
npm run dev                   # API on http://localhost:5000

# 2. Frontend (new terminal, project root)
npm install
npm run dev                   # open http://localhost:5173
```

Default manager login (change it in `server/.env`, then run `npm run create-admin` again):

- Email: `manager@obbs.local`
- Password: `Manager@2026`

Demo accounts (after `npm run seed:demo`) all use the password `Demo1234`:
`muhimbili@demo.local`, `dodoma@demo.local`, `bugando@demo.local` (banks),
`asha@demo.local`, `joseph@demo.local`, `neema@demo.local` (donors), `hassan@demo.local` (recipient).

## Tests (Chapter 5)

```bash
cd server
npm run test:unit    # UT-01 … UT-23, business rules (no database needed)
npm run test:api     # TC01 … TC52, black-box API tests (server must be running)
npm run test:load    # Table 5.2: 25 concurrent users x 4 rounds x 4 calls = 400 requests
```

The API and load tests log in as the manager account from `.env`. The API tests delete the
accounts they create when they finish; `npm run clean:test` removes any left behind by an
interrupted run.

After pulling a newer version of the code, run `npm run db:migrate` in `server` to add any new
database columns without losing data (`start.bat` does this automatically).

## Project structure

```
server/
  schema.sql             13 tables: users, appointments, donations, blood_stock,
                         blood_requests, inter_bank_requests, blood_units, notifications,
                         deferrals, donor_appeals, appeal_recipients, password_resets, audit_log
  config.js              connection settings and blood-banking rule values (Section 4.5)
  db.js                  connection pool and transaction helper
  middleware/auth.js     JWT check and role-based access control
  utils/rules.js         compatibility table, eligibility, expiry dates
  utils/screening.js     health questions, donation-day checks, deferral reasons
  utils/appeals.js       who receives a donor appeal
  utils/recognition.js   donor number and badges
  utils/audit.js         audit log: the recorded actions and their wording
  utils/mailer.js        sends email (password-reset links) or prints it in the API window
  utils/reminders.js     "you can donate again" reminders (run hourly by index.js)
  utils/stock.js         blood bags: add, issue first-expiry-first-out (row lock), transfer,
                         discard, hourly expiry check, low-stock alert
  routes/                auth, users, stock, appointments, donations, donors, appeals,
                         blood-requests, inter-bank-requests, notifications, reports
  tests/                 unit, API and load tests
src/
  pages/donor/           Donor module
  pages/recipient/       Recipient module
  pages/bank/            Blood Bank module (incl. donation-day check, donor appeals)
  pages/manager/         Blood Bank Manager (admin) module
  components/            layout, live notification bell, stock grid, donor card
  utils/certificate.js   downloadable HTML donation certificate
  utils/donorCard.js     printable donor card
  utils/report.js        monthly PDF report (jsPDF)
  i18n.jsx, locales/     language switch and Swahili translations
```

## Main API endpoints (Table 4.4)

| Method | Endpoint | Role |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | Public |
| POST | /api/auth/forgot-password, /api/auth/reset-password | Public |
| GET/PUT | /api/auth/me | Any logged-in user |
| GET | /api/users | Depends on role |
| PATCH/DELETE | /api/users/:id/status, /api/users/:id | Blood Bank Manager |
| GET/POST | /api/stock | Blood bank (receives bags) |
| GET | /api/stock/compatible?bloodType= | Any logged-in user |
| GET | /api/stock/units?status=&bloodType= | Blood bank (own bags) / manager |
| PATCH | /api/stock/units/:id/discard | Blood bank |
| GET/POST | /api/appointments | Donor (book) |
| GET | /api/appointments/screening | Any logged-in user (health questions and limits) |
| PATCH | /api/appointments/:id/status | Blood bank (approve, complete after health check, defer, reject) |
| GET | /api/donations | Donor / bank / manager |
| GET/POST | /api/blood-requests | Recipient or donor (request) |
| PATCH | /api/blood-requests/:id/status | Blood bank |
| GET/POST/PATCH | /api/inter-bank-requests | Blood bank |
| GET/POST/PATCH | /api/notifications | All / manager sends |
| GET | /api/notifications/stream | Any logged-in user (Server-Sent Events) |
| GET | /api/reports/summary?month=YYYY-MM | Blood Bank Manager |
| GET/POST | /api/appeals | Blood bank sends; donor sees appeals sent to them |
| PATCH | /api/appeals/:id/close | Blood bank |
| GET | /api/donors/card | Donor |
| POST | /api/reports/reminders | Blood Bank Manager (run reminders now) |
| POST | /api/reports/expiry-check | Blood Bank Manager (run the expiry check now) |
| GET | /api/audit?category=&from=&to=&search=&userId=&before= | Blood Bank Manager (audit log) |
| GET | /api/reports/trends?from=YYYY-MM&to=YYYY-MM&bankId= | Blood Bank Manager (statistics) |

## Rule values

Defined once in `server/config.js`: donor age 18–65, 90 days between donations, 35-day shelf life,
expiry warning 3 days before, low-stock alert below 5 units. These are prototype values and must be
confirmed against NBTS guidance.

### Bag-by-bag stock and expiry (Recommendation 7)

Stock is kept per **bag** (`blood_units`), not only as a number. Each bag has a number
(`OBBS-U-000123`), its collection and expiry dates, and where it came from: a verified donation
(linked to the donor), blood received from outside, or the opening stock recorded when bag tracking
started. `blood_stock.units` is the count of a bank's usable bags of each group.

- **First expiry, first out:** an approved request or transfer takes the bags that expire first.
  The bag numbers are recorded on the request, so every bag can be traced from donor to patient.
- **Expired bags leave the stock automatically.** The server checks every hour (the manager can run
  it at once with `POST /api/reports/expiry-check`), and a bag past its expiry date is never issued.
- **Warning before expiry:** the bank is told once when bags will expire within 3 days, so it can
  issue them first or offer them to another bank.
- **Transfers move the bags themselves**, keeping their numbers and expiry dates.
- **Discarding** a bag (damaged, storage temperature not kept, missing at a count, other) needs a
  reason and removes it from stock.
- When a bag from a donation is issued, the donor is told that their blood is helping a patient
  (without saying who).

### Forgotten password

*Forgot your password?* on the login page asks for the account's email. The server sends a link
that works **once, for 30 minutes** (`/reset-password?token=…`); only a SHA-256 hash of the token is
stored. The reply is the same whether or not the email has an account, and at most one link is
made every 2 minutes per account. After a reset, every session opened before it ends, the user gets
a security notice, and both steps appear in the audit log. Changing the password on the profile
page also ends the account's other sessions.

The link is emailed through the account set in `server/.env` (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`; for Gmail use `smtp.gmail.com`, port 587 and an app
password). With no email account set, the email is **printed in the API window** so the flow can be
shown on one computer.

### Statistics for the manager (Recommendation 2)

The manager's **Statistics** tab shows, for a range of months (up to 24) and all banks or one:
verified donations per month (standard and low-volume), blood requests per month by outcome,
units requested and issued by blood group, and the bags leaving stock each month (issued, expired,
discarded), with the approval rate, the average time to answer a request and the share of bags
wasted. **Days of supply** divides each group's current stock by the units issued per day over the
last 30 days (below 3 days critical, below 7 low: prototype thresholds). The charts are plain SVG,
so no chart library is downloaded.

`npm run seed:history` fills the demo banks with a year of **demonstration** history (30 demo
donors, about one request a day, bags issued first-expiry-first-out) so the charts have something
to show. It is made-up data for demonstrations and must not be reported as research results.

### Audit log

Every important action is recorded in `audit_log` with who did it, the person it concerned, when
and from which address: logins (including failed and refused ones), registrations, account
approvals and deletions, bookings, verified donations, deferrals, request and transfer decisions
(with the bag numbers), bags received, discarded or expired, appeals, announcements and the
manager's manual checks. This answers OWASP Top 10 A09:2021 (Security Logging and Monitoring
Failures). Rows are written in the same database transaction as the action, so work that is rolled
back is never logged as done, and the application never changes or deletes them. The manager reads
the log under *Activity → Audit log*, filtered by type, dates or a name, 50 entries at a time.
Each entry is shown in the reader's language.

### Donor health screening

Anyone can open a donor account, but an account is not permission to donate. Following WHO (2012),
donor selection is repeated at every donation:

1. **Health questions when booking** — six questions (feeling well, weight, recent illness,
   medication, pregnancy, recent surgery/tattoo/transfusion). An answer that shows a reason not to
   donate stops the booking and tells the donor what to do.
2. **Donation-day health check by the blood bank** — weight, haemoglobin, blood pressure, pulse and
   temperature. Blood can be collected only when every value is within the limits in
   `SCREENING_LIMITS` (`server/config.js`); otherwise the bank **defers** the donor for a number of
   days or permanently, and the donor cannot book until the deferral ends.
3. **Blood group confirmation** — the group a donor types at registration is shown as *not yet
   confirmed* until a blood bank records the result of the grouping test on a donation day. A
   corrected group updates the donor's profile, the donation and the stock, and is then locked.

Laboratory tests on donated blood (infection markers) stay outside the system (Section 1.6); their
results are sensitive health data under the Personal Data Protection Act, 2022. The questions and
limits are prototype values to be confirmed with NBTS.

### Donor card, badges and reminders (Recommendation 9)

Each donor has a **digital donor card** (as in eProgesa, Kenya) on the overview: donor number
(`OBBS-D-000123`), blood group and whether a blood bank has confirmed it, number of donations,
total volume given and the date the donor may donate again. It can be downloaded and printed at
bank-card size. Non-monetary **badges** are earned at 1, 5, 10, 25 and 50 verified donations, with
a notification when a new one is reached. Once the minimum interval has passed since a donor's last
donation, the server sends a single **"you can donate again"** reminder; it checks every hour and
the manager can run it at once with `POST /api/reports/reminders`.

### Urgent appeals to donors

Like BISKIT in Nigeria, a blood bank short of a blood group can send an **appeal** (tab *Donor
appeals*; the overview links to it when stock is low). It reaches only donors who could donate
today — right age, at least 90 days since their last donation, not deferred, no open appointment —
in the bank's region (or all regions), of the needed group or, if chosen, every compatible group.
Donors see the appeal at the top of their dashboard with a **Book now** button that fills in the
bank; the bank sees how many donors were reached, booked and donated, live. An appeal stays open
for 1–14 days or until the bank closes it, and only one appeal per group can be open at a time.

### Donors who need blood

A donor requests blood from the same account (tab **I need blood**); there is no second
registration. Pending requests at a blood bank are ordered by clinical urgency first; within the
same urgency, requests from people with at least one verified donation come first, then the oldest.
Being a donor never moves a request ahead of a more urgent one, so a patient in an emergency is
never kept waiting, and donation does not become a form of payment for priority.

### Swahili and English (Recommendation 2)

Every page has an **EN | SW** switch; the choice is remembered in the browser, and the first visit
follows the browser's language. English text is the translation key:

- `src/locales/sw.js` — interface text (pages, PDF report, certificate)
- `server/locales/sw.js` — API error and success messages, chosen from the `Accept-Language` header

System notifications are stored as English templates plus their values (`notifications.params`),
so each reader sees them in the language they are using now, even after switching. Announcements
typed by the manager are shown exactly as written. Names, regions and reasons typed by users are
not translated.

### Real-time notifications (Recommendation 4)

Each logged-in page opens one Server-Sent Events stream (`/api/notifications/stream`, read with
`fetch` so the token stays in the `Authorization` header). A notification is pushed the moment it is
saved — after its database transaction commits — and open dashboards reload their data, so a blood
bank sees a new request without refreshing. A green dot on the bell shows the stream is connected;
if it drops, the page reconnects and checks every 30 seconds in the meantime. Streams are kept in
the API process's memory, so the API runs as a single instance.

### Collection volume (Recommendation 13)

When a blood bank verifies a donation it enters the measured volume. For a 450 mL bag the system
classifies the collection automatically:

| Volume | Class | Effect |
|---|---|---|
| 405–495 mL | Standard unit | Added to stock |
| 300–404 mL | Low-volume unit | Added to stock, marked “red cells only” |
| below 300 mL | Incomplete collection | Not added to stock; the appointment is closed as rejected and the donor may book again |
| above 495 mL | — | Refused as outside the accepted range; the measurement must be checked |
