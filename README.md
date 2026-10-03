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
npm run test:unit    # UT-01 … UT-15, business rules (no database needed)
npm run test:api     # TC01 … TC32, black-box API tests (server must be running)
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
  schema.sql             7 tables: users, appointments, donations, blood_stock,
                         blood_requests, inter_bank_requests, notifications
  config.js              connection settings and blood-banking rule values (Section 4.5)
  db.js                  connection pool and transaction helper
  middleware/auth.js     JWT check and role-based access control
  utils/rules.js         compatibility table, eligibility, expiry dates
  utils/stock.js         takeFromStock (row lock), addToStock, low-stock alert
  routes/                auth, users, stock, appointments, donations,
                         blood-requests, inter-bank-requests, notifications, reports
  tests/                 unit, API and load tests
src/
  pages/donor/           Donor module
  pages/recipient/       Recipient module
  pages/bank/            Blood Bank module
  pages/manager/         Blood Bank Manager (admin) module
  components/            layout, notification bell (polls every 30 s), stock grid
  utils/certificate.js   downloadable HTML donation certificate
  utils/report.js        monthly PDF report (jsPDF)
  i18n.jsx, locales/     language switch and Swahili translations
```

## Main API endpoints (Table 4.4)

| Method | Endpoint | Role |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | Public |
| GET/PUT | /api/auth/me | Any logged-in user |
| GET | /api/users | Depends on role |
| PATCH/DELETE | /api/users/:id/status, /api/users/:id | Blood Bank Manager |
| GET/POST/PUT | /api/stock | Blood bank (changes) |
| GET | /api/stock/compatible?bloodType= | Any logged-in user |
| GET/POST | /api/appointments | Donor (book) |
| PATCH | /api/appointments/:id/status | Blood bank |
| GET | /api/donations | Donor / bank / manager |
| GET/POST | /api/blood-requests | Recipient or donor (request) |
| PATCH | /api/blood-requests/:id/status | Blood bank |
| GET/POST/PATCH | /api/inter-bank-requests | Blood bank |
| GET/POST/PATCH | /api/notifications | All / manager sends |
| GET | /api/notifications/stream | Any logged-in user (Server-Sent Events) |
| GET | /api/reports/summary?month=YYYY-MM | Blood Bank Manager |

## Rule values

Defined once in `server/config.js`: donor age 18–65, 90 days between donations, 35-day shelf life,
low-stock alert below 5 units. These are prototype values and must be confirmed against NBTS guidance.

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
