// Adds a year of DEMONSTRATION history to the demo blood banks so the Manager's charts have data:
// demo donors with donations every 90+ days (a few deferred), demo recipients' requests answered
// over the year, and the bags behind them issued first-expiry-first-out, with the rest expiring or
// discarded. Every account it creates uses an @demo.local address and private generated credentials.
// Run after npm run seed:demo. It is not real data and must not be reported as research results.
import bcrypt from 'bcryptjs';
import { demoCredential, recordDemoCredential } from '../utils/development.js';
import { pool, query } from '../db.js';
import { addDays, expiryDate, today } from '../utils/rules.js';

const BANKS = [['muhimbili@demo.local', 0.5], ['dodoma@demo.local', 0.25], ['bugando@demo.local', 0.25]];
const GROUPS = [['O+', 44], ['A+', 25], ['B+', 20], ['AB+', 4], ['O-', 3], ['A-', 2], ['B-', 1.5], ['AB-', 0.5]];
const FIRST = ['Amani', 'Baraka', 'Daudi', 'Esther', 'Fatuma', 'Godfrey', 'Halima', 'Ibrahimu', 'Janeth', 'Khamis',
    'Lucy', 'Mwanaidi', 'Nassoro', 'Omari', 'Pendo', 'Rehema', 'Saidi', 'Tumaini', 'Upendo', 'Victor',
    'Winfrida', 'Yusuph', 'Zawadi', 'Elia', 'Agnes', 'Bakari', 'Consolata', 'Dotto', 'Eliya', 'Furaha'];
const LAST = ['Mollel', 'Massawe', 'Mrema', 'Kimaro', 'Lyimo', 'Swai', 'Shirima', 'Msuya', 'Mwakyusa', 'Ngowi',
    'Temba', 'Urio', 'Kessy', 'Minja', 'Mbwambo', 'Chacha', 'Wambura', 'Magesa', 'Mlay', 'Kombo'];
const RECIPIENTS = ['Zuhura Ally', 'Peter Mbise', 'Mariam Said', 'Elias Kweka'];
const DONOR_COUNT = 30;
const DAYS = 365;

// Same numbers on every run (mulberry32), so the demo looks the same on every computer.
let seed = 2026;
function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min, max) => min + Math.floor(random() * (max - min + 1));
function weighted(pairs) {
    let r = random() * pairs.reduce((s, [, w]) => s + w, 0);
    for (const [value, w] of pairs) { r -= w; if (r <= 0) return value; }
    return pairs[0][0];
}
const at = (date, hour, minute = 0) => `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
function addHours(dateTime, hours) {
    const d = new Date(`${dateTime.replace(' ', 'T')}Z`);
    d.setUTCMinutes(d.getUTCMinutes() + Math.round(hours * 60));
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

const COURIERS = [['Juma Ally', '0754 210 331'], ['Rehema Msuya', '0715 448 902'], ['Peter Mollel', '0768 903 114'], ['Saida Omari', '0784 551 276']];

/*
 * Approved demo requests get their delivery steps: about 60% collected at the bank, the rest sent
 * with a courier, received a few hours after approval (sooner when critical). Requests approved in
 * the last 12 hours are still on their way. Also fills history added before delivery tracking existed.
 */
async function addDeliveries() {
    const rows = await query(
        `SELECT id, urgency, COALESCE(decided_at, updated_at) AS decided FROM blood_requests
         WHERE reason = 'Demo history' AND status = 'approved' AND received_at IS NULL AND courier_name IS NULL AND ready_at IS NULL
         ORDER BY id`);
    seed = 4242;
    const recentFrom = addHours(`${today()} ${new Date().toTimeString().slice(0, 8)}`, -12);
    for (const r of rows) {
        const fast = r.urgency === 'critical';
        const collect = random() < 0.6;
        const stepAt = addHours(r.decided, (fast ? between(5, 30) : between(15, 150)) / 60);
        const receivedAt = addHours(stepAt, (fast ? between(20, 60) : between(40, 360)) / 60);
        const done = r.decided < recentFrom;
        const by = collect ? weighted([['bank', 3], ['recipient', 1]]) : weighted([['recipient', 3], ['bank', 1]]);
        if (collect) {
            await query('UPDATE blood_requests SET decided_at = ?, delivery_status = ?, ready_at = ?, received_at = ?, received_confirmed_by = ? WHERE id = ?',
                [r.decided, done ? 'received' : 'ready', stepAt, done ? receivedAt : null, done ? by : null, r.id]);
        } else {
            const [courier, phone] = COURIERS[between(0, COURIERS.length - 1)];
            await query(
                `UPDATE blood_requests SET decided_at = ?, delivery_status = ?, dispatched_at = ?, courier_name = ?, courier_phone = ?,
                        received_at = ?, received_confirmed_by = ? WHERE id = ?`,
                [r.decided, done ? 'received' : 'dispatched', stepAt, courier, phone, done ? receivedAt : null, done ? by : null, r.id]);
        }
    }
    return rows.length;
}

// Hospitals served by each demo bank, and the ward that usually asks for blood for each reason.
const HOSPITALS = {
    'muhimbili@demo.local': ['Muhimbili National Hospital', 'Amana Regional Referral Hospital', 'Mwananyamala Regional Referral Hospital', 'Temeke Regional Referral Hospital'],
    'dodoma@demo.local': ['Dodoma Regional Referral Hospital', 'Benjamin Mkapa Hospital'],
    'bugando@demo.local': ['Bugando Medical Centre', 'Sekou Toure Regional Referral Hospital'],
};
const INDICATIONS = [['childbirth', 25], ['anaemia', 25], ['surgery', 20], ['trauma', 15], ['blood_disorder', 8], ['cancer', 4], ['other', 3]];
const WARDS = {
    childbirth: 'Maternity ward', anaemia: 'Paediatric ward', surgery: 'Surgical ward', trauma: 'Emergency department',
    blood_disorder: 'Sickle cell clinic', cancer: 'Oncology ward', other: 'Medical ward',
};

/*
 * Demo requests name the patient (the demo recipient), a hospital the bank serves, the ward, the
 * reason and a made-up doctor; approved ones were confirmed with that doctor. Also fills history
 * added before requests named the hospital.
 */
async function addHospitals() {
    const rows = await query(
        `SELECT r.id, r.status, r.decided_at, p.name AS patient, b.email AS bank FROM blood_requests r
         JOIN users p ON p.id = r.recipient_id JOIN users b ON b.id = r.blood_bank_id
         WHERE r.reason = 'Demo history' AND r.hospital IS NULL ORDER BY r.id`);
    seed = 7171;
    for (const r of rows) {
        const hospitals = HOSPITALS[r.bank] ?? ['Regional Referral Hospital'];
        const indication = weighted(INDICATIONS);
        const doctor = `Dr. ${FIRST[between(0, FIRST.length - 1)]} ${LAST[between(0, LAST.length - 1)]}`;
        const approved = r.status === 'approved';
        await query(
            `UPDATE blood_requests SET patient_name = ?, hospital = ?, ward = ?, indication = ?, doctor_name = ?, doctor_phone = ?,
                    confirmed_with = ?, confirmed_at = ? WHERE id = ?`,
            [r.patient, hospitals[between(0, hospitals.length - 1)], `${WARDS[indication]} ${between(1, 8)}`, indication, doctor,
                `0713 ${between(100, 999)} ${between(100, 999)}`, approved ? doctor : null, approved ? r.decided_at : null, r.id]);
    }
    return rows.length;
}

async function createUser(role, name, email, extra, hash) {
    const result = await query(
        `INSERT INTO users (role, status, name, email, password_hash, blood_type, date_of_birth, region, verified, created_at)
         VALUES (?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [role, name, email, hash, extra.blood_type ?? null, extra.date_of_birth ?? null, extra.region ?? null,
            role === 'donor' ? 1 : 0, extra.created_at]);
    return result.insertId;
}

try {
    const credential = demoCredential();
    const banks = [];
    for (const [email, weight] of BANKS) {
        const [bank] = await query("SELECT id, region FROM users WHERE email = ? AND role = 'bloodbank'", [email]);
        if (!bank) throw new Error('Run npm run seed:demo first: the demo blood banks are missing.');
        banks.push([bank, weight]);
    }
    const [done] = await query("SELECT COUNT(*) AS n FROM users WHERE email LIKE 'history%@demo.local'");
    if (done.n) {
        console.log('Demo history is already in the database.');
    } else {
        const now = today();
        const start = addDays(now, -DAYS);
        const hash = await bcrypt.hash(credential, 10);
        const events = [];

        // Donors and their donation days: the first within two months, then every 90-150 days.
        for (let i = 0; i < DONOR_COUNT; i += 1) {
            const bank = weighted(banks);
            const donor = {
                name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
                email: `history${String(i + 1).padStart(2, '0')}@demo.local`,
                blood_type: weighted(GROUPS),
                date_of_birth: `${between(1975, 2004)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
                region: bank.region,
                created_at: at(start, 9),
            };
            donor.id = await createUser('donor', donor.name, donor.email, donor, hash);
            await recordDemoCredential(donor.email, credential);
            for (let day = between(0, 60); day < DAYS - 1; day += between(90, 150)) {
                events.push({ type: 'donation', date: addDays(start, day), hour: between(8, 15), donor, bank });
            }
        }
        const recipients = [];
        for (const [i, name] of RECIPIENTS.entries()) {
            const id = await createUser('recipient', name, `history-recipient${i + 1}@demo.local`, { region: banks[i % banks.length][0].region, created_at: at(start, 9) }, hash);
            await recordDemoCredential(`history-recipient${i + 1}@demo.local`, credential);
            recipients.push(id);
        }
        // About one request a day across the three banks.
        for (let day = 0; day < DAYS; day += 1) {
            if (random() < 0.9) {
                events.push({
                    type: 'request', date: addDays(start, day), hour: between(7, 20),
                    bank: weighted(banks), recipient: recipients[between(0, recipients.length - 1)],
                    blood_type: weighted(GROUPS), units: weighted([[1, 40], [2, 35], [3, 15], [4, 10]]),
                    urgency: weighted([['normal', 60], ['urgent', 30], ['critical', 10]]),
                });
            }
        }
        events.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);

        const inStock = []; // bags in stock: { id, bank, blood_type, expiry }
        async function addBag(bankId, bloodType, source, collectedOn, donationId = null, classification = null) {
            const expiry = expiryDate(collectedOn);
            const result = await query(
                `INSERT INTO blood_units (blood_bank_id, blood_type, source, donation_id, classification, collected_on, expiry_date, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [bankId, bloodType, source, donationId, classification, collectedOn, expiry, at(collectedOn, 16)]);
            return { id: result.insertId, bank: bankId, blood_type: bloodType, expiry };
        }

        let donations = 0;
        let deferred = 0;
        let requests = 0;
        for (const e of events) {
            const when = at(e.date, e.hour, between(0, 59));
            if (e.type === 'donation') {
                const appt = await query(
                    `INSERT INTO appointments (donor_id, blood_bank_id, blood_type, units, appointment_date, status, created_at, updated_at)
                     VALUES (?, ?, ?, 1, ?, 'approved', ?, ?)`,
                    [e.donor.id, e.bank.id, e.donor.blood_type, e.date, addHours(when, -72), when]);
                if (random() < 0.06) {
                    // Health check not passed: low haemoglobin, back after 28 days.
                    await query("UPDATE appointments SET status = 'deferred', updated_at = ? WHERE id = ?", [when, appt.insertId]);
                    await query(
                        "INSERT INTO deferrals (donor_id, blood_bank_id, appointment_id, reason, deferred_until, created_at) VALUES (?, ?, ?, 'low_hemoglobin', ?, ?)",
                        [e.donor.id, e.bank.id, appt.insertId, addDays(e.date, 28), when]);
                    deferred += 1;
                    continue;
                }
                const low = random() < 0.08;
                const volume = low ? between(310, 400) : between(430, 480);
                const classification = low ? 'low_volume' : 'standard';
                await query("UPDATE appointments SET status = 'completed', collected_volume_ml = ?, updated_at = ? WHERE id = ?", [volume, when, appt.insertId]);
                const donation = await query(
                    `INSERT INTO donations (appointment_id, donor_id, blood_bank_id, blood_type, units, volume_ml, classification, donation_date, expiry_date, reminder_sent_at, created_at)
                     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
                    [appt.insertId, e.donor.id, e.bank.id, e.donor.blood_type, volume, classification, e.date, expiryDate(e.date),
                        addDays(e.date, 90) < now ? at(addDays(e.date, 90), 8) : null, when]);
                await query('UPDATE users SET blood_type_confirmed_at = COALESCE(blood_type_confirmed_at, ?), blood_type_confirmed_by = COALESCE(blood_type_confirmed_by, ?) WHERE id = ?',
                    [when, e.bank.id, e.donor.id]);
                const bag = await addBag(e.bank.id, e.donor.blood_type, 'donation', e.date, donation.insertId, classification);
                if (random() < 0.03) {
                    await query("UPDATE blood_units SET status = 'discarded', discard_reason = ?, status_changed_at = ? WHERE id = ?",
                        [weighted([['damaged', 2], ['cold_chain', 1]]), addHours(when, between(24, 120)), bag.id]);
                } else {
                    inStock.push(bag);
                }
                donations += 1;
                continue;
            }

            // A request, answered after a few hours (sooner when critical).
            const recent = e.date >= addDays(now, -2);
            const decidedAt = addHours(when, e.urgency === 'critical' ? between(1, 6) / 2 : between(2, 36));
            const decidedDay = decidedAt.slice(0, 10);
            let status = recent ? 'pending' : random() < 0.88 ? 'approved' : 'rejected';
            // Expired bags are never chosen; the bags that expire first are issued first.
            const usable = () => inStock.filter((b) => b.bank === e.bank.id && b.blood_type === e.blood_type && b.expiry >= decidedDay)
                .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.id - b.id);
            if (status === 'approved') {
                let bags = usable();
                if (bags.length < e.units) {
                    // Supply from the zonal blood service a few days earlier, sometimes one bag more than needed.
                    const collected = addDays(e.date, -between(3, 10));
                    for (let i = bags.length; i < e.units + (random() < 0.3 ? 1 : 0); i += 1) inStock.push(await addBag(e.bank.id, e.blood_type, 'received', collected));
                    bags = usable();
                }
                bags = bags.slice(0, e.units);
                const result = await query(
                    `INSERT INTO blood_requests (recipient_id, blood_bank_id, blood_type, units, urgency, reason, status, decided_at, delivery_status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, 'preparing', ?, ?)`,
                    [e.recipient, e.bank.id, e.blood_type, e.units, e.urgency, 'Demo history', decidedAt, when, decidedAt]);
                await query("UPDATE blood_units SET status = 'issued', blood_request_id = ?, status_changed_at = ? WHERE id IN (?)",
                    [result.insertId, decidedAt, bags.map((b) => b.id)]);
                for (const b of bags) inStock.splice(inStock.indexOf(b), 1);
            } else {
                await query(
                    `INSERT INTO blood_requests (recipient_id, blood_bank_id, blood_type, units, urgency, reason, status, rejection_reason, decided_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [e.recipient, e.bank.id, e.blood_type, e.units, e.urgency, 'Demo history', status,
                        status === 'rejected' ? 'Not enough compatible blood at the time' : null,
                        status === 'pending' ? null : decidedAt, when, status === 'pending' ? when : decidedAt]);
            }
            requests += 1;
        }

        // Bags still in stock: those past their expiry date have expired; the rest are in stock.
        let expired = 0;
        for (const b of inStock) {
            if (b.expiry < now) {
                await query("UPDATE blood_units SET status = 'expired', status_changed_at = ? WHERE id = ?", [at(addDays(b.expiry, 1), 1), b.id]);
                expired += 1;
            }
        }
        // Stock counts follow the bags (usable bags of each group).
        await query(
            `UPDATE blood_stock s SET units = (
                 SELECT COUNT(*) FROM blood_units u
                 WHERE u.blood_bank_id = s.blood_bank_id AND u.blood_type = s.blood_type AND u.status = 'available' AND u.expiry_date >= ?)
             WHERE s.blood_bank_id IN (?)`,
            [now, banks.map(([b]) => b.id)]);
        console.log(`Demo history added: ${DONOR_COUNT} donors, ${donations} donations, ${deferred} deferrals, ${requests} requests, ${expired} expired bags.`);
    }
    console.log(`Delivery steps added to ${await addDeliveries()} demo request(s).`);
    console.log(`Hospital and doctor added to ${await addHospitals()} demo request(s).`);
} catch (err) {
    console.error(`Adding demo history failed: ${err.message}`);
    process.exitCode = 1;
} finally {
    await pool.end();
}
