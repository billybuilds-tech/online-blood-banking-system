# Online Blood Banking System

Final Year Project — BSc Information Technology, Institute of Finance Management (2025/2026).

A web platform that connects **donors**, **recipients**, **blood banks** and the **Blood Bank Manager (admin)**.
React 19 + Vite frontend, Node.js/Express REST API, MySQL database.

Maintained by [Billy Patrick](https://github.com/billybuilds-tech).

## Highlights

- Role-based dashboards for donors, recipients, blood banks and the manager.
- Donation appointments, donor screening, campaigns and donation history.
- Blood bag tracking, expiry alerts and first-expiry-first-out stock allocation.
- Hospital blood requests, confirmation with the doctor and delivery tracking.
- Inter-bank transfers, donor appeals and real-time notifications.
- English and Swahili interfaces, with shared browser/server phone validation.

See [CHANGELOG.md](CHANGELOG.md) for documented updates and their validation.

## Account and Data Security

Browser sessions use HttpOnly cookies rather than storing bearer tokens in localStorage.
Cookies use Secure in production; logout, password changes and resets revoke previous
sessions through a database session version. Old browser tokens require a fresh login
after the upgrade. Authenticated event streams end on expiration or revocation.

API writes require JSON bodies/content types and an `X-CSRF-Token` obtained from
`/api/csrf-token` together with its signed cookie. The browser handles tokens and refreshes
rejected CSRF state once. Bearer clients remain supported and also need CSRF protection.
Login, registration and reset endpoints limit repeated attempts. Private API replies use
`Cache-Control: no-store` and security headers.

Passwords are capped at 72 UTF-8 bytes so bcrypt cannot ignore suffixes. Production refuses
missing, sample or short session secrets; set a random `JWT_SECRET` of at least 32 bytes,
`NODE_ENV=production`, HTTPS, the correct `CLIENT_ORIGIN` and SMTP with TLS. The API binds
to localhost by default for a reverse proxy. Set `TRUST_PROXY=1` only behind a trusted proxy.
Password-reset links and notification contents are never printed to logs.

The 2026-10-10 Snyk review resolved 41 code findings and upgraded the vulnerable PDF
library. Read [SECURITY.md](docs/SECURITY.md) for the checks, local credential rotation
and the unavailable Snyk Secrets feature. No findings were ignored.

## Requirements

- Node.js 22.12 or newer — https://nodejs.org
- MySQL 8 or MariaDB (XAMPP works: start **MySQL** in the XAMPP Control Panel)

## Quick start (Windows + XAMPP)

Double-click **`start.bat`**. It starts MySQL, installs dependencies and prepares the database
the first time, creates private random credentials in a new `server/.env`, starts the API and the frontend in their own windows, and opens
http://localhost:5173. Close the two windows to stop the system.
Dependency changes use the committed lockfiles. Close the API/frontend windows before
updating dependencies. Existing database records and existing manager passwords are preserved.

## Manual setup

```bash
# 1. Backend
cd server
npm install
copy .env.example .env        # set DB_PASSWORD, a random JWT_SECRET and a private ADMIN_PASSWORD
npm run db:init               # creates the database and its tables
npm run create-admin          # creates the Blood Bank Manager account from .env
npm run seed:demo             # optional: demo banks, donors, recipient and stock
npm run seed:history          # optional: a year of demo history for the charts (after seed:demo)
npm run dev                   # API on http://localhost:5000

# 2. Frontend (new terminal, project root)
npm install
npm run dev                   # open http://localhost:5173
```

There is no default manager password. A fresh Windows setup generates a private
`ADMIN_PASSWORD` in `server/.env`; manual setup requires a password of at least 12
characters with letters and numbers. `npm run create-admin` creates the account or
explicitly resets an existing manager's password and revokes older sessions.

- Email: `manager@obbs.local`
- Password: the private `ADMIN_PASSWORD` used when creating the account

Demo accounts (after `npm run seed:demo`) use private generated passwords recorded in
the ignored `.local/demo-credentials.json` file:
`muhimbili@demo.local`, `dodoma@demo.local`, `bugando@demo.local` (banks),
`asha@demo.local`, `joseph@demo.local`, `neema@demo.local` (donors), `hassan@demo.local` (recipient).
Demo seeders refuse production mode. Existing custom passwords are preserved.
The local security update replaced 44 accounts' published demo passwords without
removing users, stock, donations, requests or notifications. Your existing custom
manager password was preserved; the new `.env` password is used only when explicitly
creating/resetting that account.

## Tests (Chapter 5)

```bash
cd server
npm run test:unit    # 38 business-rule, phone and security checks (no database needed)
npm run test:api     # 72 API/security checks in an automatically created disposable database
npm run test:load    # Table 5.2: 25 concurrent users x 4 rounds x 4 calls = 400 requests

# Project root
npm run test:security-ui # browser sessions, CSRF recovery and safe downloads
```

API, load and browser checks create a disposable `obbs_test_*` database, random manager
credentials and an isolated API. They stop their own processes and drop that test database
afterward. They never use the main manager account or send live emails. `clean:test` refuses
normal database names and can clean an explicitly configured `obbs_test*` database.

After pulling a newer version of the code, run `npm run db:migrate` in `server` to add any new
database columns without losing data (`start.bat` does this automatically).

## Home, login and registration pages

Phone fields accept Tanzanian mobile numbers only: `06XXXXXXXX`, `07XXXXXXXX`,
`+2556XXXXXXXX` or `+2557XXXXXXXX`. Spaces and hyphens are accepted for readability;
the API saves valid numbers in `+255` format. The same validation applies to registration,
profile updates, doctors' numbers and couriers' numbers, in the browser and on the server.
The shared rules are in `shared/phone.js`; existing saved numbers are not rewritten.

The home page opens with photos of blood donation that fade one into another behind the heading,
then the system in numbers (blood banks, registered donors, verified donations, campaigns to come),
the campaigns to come, how donation works in four steps, what the system does, who it is for and a
call to register. It shows **no blood stock**: stock levels are confidential (see *Blood stock is
confidential* below).

The photos are openly licensed photos of blood donation in Africa from Wikimedia Commons (CC0 and
CC BY-SA 4.0); each photo's author and licence are shown on it and in the footer, as the licences
require. No openly licensed photos of blood donation in Tanzania were found. To use Tanzanian
photos (taken at your own blood drive with the consent of the people in them, or photos the
National Blood Transfusion Service permits you to use), put the files in `public/images/hero/` and
list them in `src/heroPhotos.js` with their credit. The login, registration and password pages have a red panel beside the form
with short messages about blood donation that change every few seconds, and the login page greets
the user by the time of day. The logo, a drop of blood with a heartbeat line, is drawn in
`src/components/Logo.jsx` and `public/favicon.svg`.

## Installing as an app (PWA)

The system can be installed like an app, with its own icon and window and without an app store:
in Chrome or Edge press **Install app** (home page header or side menu) or the install icon in the
address bar; on a phone use *Add to Home screen*. `public/manifest.webmanifest` describes the app and
`public/sw.js` (service worker) keeps a copy of the pages so the app opens without a connection.
API data is never stored offline. Browsers allow installing only from `localhost` or an HTTPS
address, so a phone can install it once the system is hosted with HTTPS.

## Pages after login

Every page after login has a **side menu** on the left: the sections of the user's role (for a
blood bank: Overview, Stock, Donations, Blood requests, Inter-bank, Donor appeals, Transactions),
then Profile, Notifications and Log out. Numbers beside an item show what is waiting (pending
requests, open bookings, unread notifications). Each section has its own address, e.g.
`/dashboard/stock`, so the browser's Back button and a page refresh keep the user in place. Below
960 px wide (tablets and phones) the menu is hidden behind the ☰ button and slides in over the page.

## Project structure

```
server/
  schema.sql             14 tables: users, appointments, donations, blood_stock,
                         blood_requests, inter_bank_requests, blood_units, notifications,
                         deferrals, donor_appeals, appeal_recipients, campaigns, password_resets, audit_log
  config.js              connection settings and blood-banking rule values (Section 4.5)
  db.js                  connection pool and transaction helper
  middleware/auth.js     JWT check and role-based access control
  utils/rules.js         compatibility table, eligibility, expiry dates
  utils/screening.js     health questions, donation-day checks, deferral reasons
  utils/appeals.js       who receives a donor appeal
  utils/recognition.js   donor number and badges
  utils/audit.js         audit log: the recorded actions and their wording
  utils/mailer.js        sends through SMTP without logging private message contents or reset links
  utils/emailOutbox.js   sends email copies of notifications, in each user's language, with retries
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
  components/            layout with side menu, live notification bell, charts, stock grid, donor card
  heroPhotos.js          the home-page photos and their credits
  nav.jsx                each role's menu sections (opened at /dashboard/<section>)
  notifications.jsx      one notification list and real-time stream for the whole page
  utils/certificate.js   downloadable HTML donation certificate
  utils/donorCard.js     printable donor card
  utils/report.js        monthly PDF report (jsPDF)
  i18n.jsx, locales/     language switch and Swahili translations
```

## Main API endpoints (Table 4.4)

| Method | Endpoint | Role |
|---|---|---|
| GET | /api/public/summary | Public (home-page counts: banks, donors, donations, campaigns to come; no stock) |
| POST | /api/auth/register, /api/auth/login | Public |
| POST | /api/auth/forgot-password, /api/auth/reset-password | Public |
| GET/PUT | /api/auth/me | Any logged-in user |
| GET | /api/users | Depends on role |
| PATCH/DELETE | /api/users/:id/status, /api/users/:id | Blood Bank Manager |
| GET | /api/stock?bankId= | Blood bank (own stock only) / manager (every bank) |
| POST | /api/stock | Blood bank (receives bags) |
| GET | /api/stock/units?status=&bloodType= | Blood bank (own bags) / manager |
| PATCH | /api/stock/units/:id/discard | Blood bank |
| GET/POST | /api/appointments | Donor (book) |
| GET | /api/appointments/screening | Any logged-in user (health questions and limits) |
| PATCH | /api/appointments/:id/status | Blood bank (approve, complete after health check, defer, reject) |
| GET | /api/donations | Donor / bank / manager |
| GET/POST | /api/blood-requests | Recipient or donor (request for a patient in hospital, with the doctor's details) |
| PATCH | /api/blood-requests/:id/status | Blood bank (approving needs `confirmed_with`: who at the hospital confirmed) |
| PATCH | /api/blood-requests/:id/delivery | Blood bank (ready, dispatched, received); requester (received) |
| GET/POST/PATCH | /api/inter-bank-requests | Blood bank |
| GET/POST/PATCH | /api/notifications | All / manager sends |
| GET | /api/notifications/email | Any logged-in user (is email set up?); the manager also sees counts |
| POST | /api/notifications/email/test | Blood Bank Manager (send a test email) |
| GET | /api/notifications/stream | Any logged-in user (Server-Sent Events) |
| GET | /api/reports/summary?month=YYYY-MM | Blood Bank Manager |
| GET/POST | /api/appeals | Blood bank sends; donor sees appeals sent to them |
| PATCH | /api/appeals/:id/close | Blood bank |
| GET/POST | /api/campaigns | Blood bank plans; donor sees campaigns to come; manager sees all |
| PATCH | /api/campaigns/:id/cancel | Blood bank |
| GET | /api/public/campaigns | Public (campaigns to come, for the home page) |
| GET | /api/donors/card | Donor |
| POST | /api/reports/reminders | Blood Bank Manager (run reminders now) |
| POST | /api/reports/expiry-check | Blood Bank Manager (run the expiry check now) |
| GET | /api/audit?category=&from=&to=&search=&userId=&before= | Blood Bank Manager (audit log) |
| GET | /api/reports/trends?from=YYYY-MM&to=YYYY-MM&bankId= | Blood Bank Manager (statistics) |

## Rule values

Defined once in `server/config.js`: donor age 18–65, 90 days between donations, 35-day shelf life,
expiry warning 3 days before, low-stock alert below 5 units. These are prototype values and must be
confirmed against NBTS guidance.

### Blood stock is confidential

Stock levels are kept under administration, not shown to the public:

- A **blood bank** sees only its own stock and bags (menu *Stock*); asking for another bank's stock
  is refused (`403`).
- The **Blood Bank Manager** sees the stock of every approved bank (menu *Blood stock*): a table of
  banks by blood group with totals, groups below the low-stock level in red and bags expiring soon.
  Choosing a bank shows its usable bags, read only.
- **Donors and recipients** see no stock. Their *Blood banks* page lists the approved banks with their
  region, address and phone, the user's region first, and a **Request blood here** button that
  opens the request form with that bank chosen. The bank checks its stock and answers the request.
- The home page and `/api/public/summary` give only counts (banks, donors, donations, campaigns).

The server enforces this (`requireRole` on `GET /api/stock` and `/api/stock/units`), so hiding a
menu item is not what protects the figures. Test TC61 checks it for each role.

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

### Email notifications

When an email account is set in `server/.env`, every notification is also sent to the user's email:
account approvals, bookings and their results, blood requests and decisions, appeals, expiry and
low-stock warnings, reminders, security notices and the manager's messages sent *in the system and
by email*. Each email is written in the language the user last used in the system, with a button
that opens it. Users can turn email copies off under *My profile → Email notifications*; password
reset links still use SMTP even when notification copies are disabled.

Emails wait in the database (`notifications.email_status`), so none is lost when the API restarts
or the email server is unreachable: a failed email is tried again after 5, 10, 15 and 20 minutes,
then marked *failed*. Addresses of demonstration and test accounts (`.local`, `.test`,
`example.com`) are never sent to, and confidential message contents are never logged.

To connect Gmail (free, about 500 emails a day):

1. Turn on 2-Step Verification for the Google account, then create an **app password**
   (Google Account → Security → 2-Step Verification → App passwords).
2. In `server/.env` set:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=yourname@gmail.com
   SMTP_PASSWORD=the 16-letter app password
   SMTP_FROM=Online Blood Banking System <yourname@gmail.com>
   ```
3. Restart the API. The manager's *Send notification* page shows the email gateway, how many emails
   were sent, are waiting or failed, and can send a test email.

Any other SMTP service (Brevo, Outlook, a university mail server) works the same way.

### Forgotten password

*Forgot your password?* on the login page asks for the account's email. The server sends a link
that works **once, for 30 minutes** (`/reset-password?token=…`); only a SHA-256 hash of the token is
stored. The reply is the same whether or not the email has an account, and at most one link is
made every 2 minutes per account. After a reset, every session opened before it ends, the user gets
a security notice, and both steps appear in the audit log. Changing the password on the profile
page also ends the account's other sessions.

The link is emailed through the account set in `server/.env` (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`; for Gmail use `smtp.gmail.com`, port 587 and an app
password). SMTP must be configured to receive the link, including during development.
Reset links and private email contents are never printed in the API window.

### Statistics for the manager (Recommendation 2)

The manager's **Statistics** page shows, for a range of months (up to 24) and all banks or one:
verified donations per month (standard and low-volume), blood requests per month by outcome,
units requested and issued by blood group, and the bags leaving stock each month (issued, expired,
discarded), with the approval rate, the average time to answer a request and the share of bags
wasted. **Days of supply** divides each group's current stock by the units issued per day over the
last 30 days (below 3 days critical, below 7 low: prototype thresholds). The charts are plain SVG,
so no chart library is downloaded.

The monthly PDF report (*Reports → Download PDF*) ends with a page of the same charts, drawn with
jsPDF: current stock by blood group against the low-stock level, days of supply, and the trends of
the 12 months up to the report's month.

`npm run seed:history` fills the demo banks with a year of **demonstration** history (30 demo
donors, about one request a day, bags issued first-expiry-first-out) so the charts have something
to show. It is made-up data for demonstrations and must not be reported as research results.

### Blood donation campaigns

As the National Blood Transfusion Service collects much of its blood at schools, places of worship
and workplaces, a blood bank can plan a **campaign** (title, venue, region, date, hours and a target
in units). Donors of that region who could donate on the day are invited at once. Donors see
campaigns to come (their region first, and a reminder on the overview), and **register** with the
usual health questions and eligibility checks; the registration is an appointment for that day,
approved at once, and the bank checks each donor's health on the day under *Donations* as usual. The
bank sees each campaign's registrations, units collected against the target and deferrals, and can
cancel a campaign that has not taken place (registered donors are told). Campaigns to come are also
listed on the home page.

### Requests come from a hospital, on a doctor's advice

Blood is given to a patient who is in hospital, when a doctor asks for it; nobody can ask for blood
just from anywhere. A request therefore names:

- the **patient**, the **hospital** and the **ward and bed**;
- **why the patient needs blood**, in broad groups (surgery, childbirth or pregnancy, severe anaemia
  e.g. from malaria, accident or injury, sickle cell or another blood disorder, cancer treatment,
  other) and optional clinical notes;
- the **doctor who asked for the blood**: name, phone and, if known, the Medical Council of
  Tanganyika (MCT) registration number from the doctor's request form;
- a **declaration** by the requester that a doctor asked for this blood for this patient, who is in
  this hospital.

The server refuses a request without these. Before approving, the blood bank calls the doctor or the
ward to confirm that the patient is there and needs the blood, and records **who confirmed it**
(`confirmed_with`, `confirmed_at`); the system does not approve a request without it, and the audit log
keeps the name. The blood then goes to the hospital: it is collected from the bank or sent with a
courier (see below). Only broad reasons are stored, not diagnoses or test results, and a request is
seen only by the person who sent it, the bank it was sent to and the Blood Bank Manager. Test TC62
checks these rules.

### Delivery of approved requests

Like LifeBank in Nigeria, an approved request does not stop at "approved". The blood bank records
where the blood is: **being prepared → ready for collection** at the bank, or **sent with a courier**
(name and phone) **→ received**. The person who asked for the blood is told at each step, sees the
progress and the courier's number on *My requests*, and confirms receipt with **I have received the
blood** (or the bank records the hand-over). The manager's statistics show the average time from a
request to its receipt; the time to answer uses `decided_at`, so later delivery steps do not change it.

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

Like BISKIT in Nigeria, a blood bank short of a blood group can send an **appeal** (menu *Donor
appeals*; the overview links to it when stock is low). It reaches only donors who could donate
today — right age, at least 90 days since their last donation, not deferred, no open appointment —
in the bank's region (or all regions), of the needed group or, if chosen, every compatible group.
Donors see the appeal at the top of their dashboard with a **Book now** button that fills in the
bank; the bank sees how many donors were reached, booked and donated, live. An appeal stays open
for 1–14 days or until the bank closes it, and only one appeal per group can be open at a time.

### Donors who need blood

A donor requests blood from the same account (menu **I need blood**); there is no second
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
