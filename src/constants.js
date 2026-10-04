import { getLocale } from './lang.js';

export const BLOOD_TYPES = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

// Must match server/utils/rules.js (Table 4.3).
export const COMPATIBILITY = {
    'O-': ['O-'],
    'O+': ['O+', 'O-'],
    'A-': ['A-', 'O-'],
    'A+': ['A+', 'A-', 'O+', 'O-'],
    'B-': ['B-', 'O-'],
    'B+': ['B+', 'B-', 'O+', 'O-'],
    'AB-': ['AB-', 'A-', 'B-', 'O-'],
    'AB+': BLOOD_TYPES,
};

export const LOW_STOCK = 5;

// Blood bags (Recommendation 7). Must match server/config.js and server/utils/stock.js.
export const EXPIRY_WARNING_DAYS = 3;
export const SHELF_LIFE_DAYS = 35;

export const UNIT_STATUS_LABELS = {
    available: 'In stock',
    issued: 'Issued',
    expired: 'Expired',
    discarded: 'Discarded',
};

export const DISCARD_REASON_LABELS = {
    damaged: 'Bag damaged or leaking',
    cold_chain: 'Storage temperature not kept',
    missing: 'Missing at stock count',
    other: 'Other reason',
};

// Collection volume classes for a 450 mL bag. Must match server/config.js.
export const VOLUME = { BAG: 450, STANDARD_MIN: 405, STANDARD_MAX: 495, LOW_MIN: 300 };

export function classifyCollection(ml) {
    if (ml > VOLUME.STANDARD_MAX) return 'over_volume';
    if (ml >= VOLUME.STANDARD_MIN) return 'standard';
    if (ml >= VOLUME.LOW_MIN) return 'low_volume';
    return 'incomplete';
}

export const COLLECTION_LABELS = {
    standard: 'Standard unit',
    low_volume: 'Low volume · red cells only',
    incomplete: 'Incomplete · not added to stock',
    over_volume: 'Above accepted range · check the measurement',
};

// Must match DEFERRAL_REASON_LABELS in server/utils/screening.js.
export const DEFERRAL_REASON_LABELS = {
    low_hemoglobin: 'Low haemoglobin',
    low_weight: 'Weight below the minimum',
    blood_pressure: 'Blood pressure outside the safe range',
    pulse: 'Pulse outside the safe range',
    temperature: 'Raised temperature',
    recent_illness: 'Recent illness',
    medication: 'Current medication',
    other_medical: 'Medical reason (the blood bank will explain in person)',
};

// Note shown beside an appointment. Incomplete collections and deferrals are rebuilt from their
// data so they appear in the reader's language; other reasons are shown as the blood bank typed them.
export function appointmentNote(appointment, t) {
    if (appointment.status === 'deferred' && appointment.deferral_reason) {
        const reason = t(DEFERRAL_REASON_LABELS[appointment.deferral_reason]);
        return appointment.deferred_until
            ? t('Deferred until {date} · {reason}', { date: formatDate(appointment.deferred_until), reason })
            : t('Deferred permanently · {reason}', { reason });
    }
    if (appointment.status === 'rejected' && appointment.collected_volume_ml != null) {
        return t('Incomplete collection: {volume} mL (a usable unit needs at least {min} mL)',
            { volume: appointment.collected_volume_ml, min: VOLUME.LOW_MIN });
    }
    return appointment.rejection_reason || appointment.notes || '';
}

export const ROLE_LABELS = {
    donor: 'Donor',
    recipient: 'Recipient',
    bloodbank: 'Blood Bank',
    admin: 'Blood Bank Manager',
};

export const REGIONS = [
    'Arusha', 'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera', 'Katavi', 'Kigoma', 'Kilimanjaro',
    'Lindi', 'Manyara', 'Mara', 'Mbeya', 'Morogoro', 'Mtwara', 'Mwanza', 'Njombe', 'Pemba North',
    'Pemba South', 'Pwani', 'Rukwa', 'Ruvuma', 'Shinyanga', 'Simiyu', 'Singida', 'Songwe', 'Tabora',
    'Tanga', 'Unguja North', 'Unguja South', 'Mjini Magharibi',
];

// Dates follow the interface language (e.g. "2 Oct 2026" / "2 Okt 2026").
export function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

// 'YYYY-MM' as a short month and year in the interface language, e.g. "Oct 26" / "Okt 26".
export function formatMonth(month) {
    const date = new Date(`${month}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? month : date.toLocaleDateString(getLocale(), { month: 'short', year: '2-digit' });
}

// 'YYYY-MM' moved n months forward (or back when n is negative).
export function addMonths(month, n) {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function todayString() {
    return new Date().toLocaleDateString('en-CA');
}

// Chart colours, shared by the Statistics tab and the charts in the PDF report.
export const CHART_COLORS = { green: '#2e8b57', amber: '#e3a020', red: '#b31b2a', blue: '#2f6fb3', grey: '#9a8f8c', lightBlue: '#8fa9d6' };

/*
 * The trend charts of the Statistics tab, also drawn in the PDF report. Titles and labels are English
 * keys, translated where they are drawn. Each chart shows the rows of trends[id] from /reports/trends:
 * one per month, or one per blood group for 'groups'.
 */
export const TREND_CHARTS = [
    { id: 'donations', title: 'Verified donations per month', stacked: true, series: [
        { key: 'standard', label: 'Standard units', color: CHART_COLORS.green },
        { key: 'low_volume', label: 'Low-volume units', color: CHART_COLORS.amber },
    ] },
    { id: 'requests', title: 'Blood requests per month', stacked: true, series: [
        { key: 'approved', label: 'Approved', color: CHART_COLORS.green },
        { key: 'rejected', label: 'Rejected', color: CHART_COLORS.red },
        { key: 'pending', label: 'Pending', color: CHART_COLORS.grey },
    ] },
    { id: 'groups', title: 'Units requested and issued by blood group', stacked: false, series: [
        { key: 'requested', label: 'Requested', color: CHART_COLORS.lightBlue },
        { key: 'issued', label: 'Issued', color: CHART_COLORS.red },
    ] },
    { id: 'bags', title: 'Bags leaving stock each month', stacked: true, series: [
        { key: 'issued', label: 'Issued to patients', color: CHART_COLORS.blue },
        { key: 'expired', label: 'Expired', color: CHART_COLORS.grey },
        { key: 'discarded', label: 'Discarded', color: CHART_COLORS.red },
    ] },
];

// Days of supply below CRITICAL and LOW are shown as critical and low (prototype values);
// the bars run from 0 to SCALE days, so a full bar means SCALE days or more.
export const SUPPLY_DAYS = { CRITICAL: 3, LOW: 7, SCALE: 30 };

// The days-of-supply bars for each blood group: { label, value, text, tone } with tone ok, warn or bad.
export function supplyRows(supply, t) {
    return supply.map((s) => {
        let text;
        let tone = 'ok';
        if (!s.units) { text = t('None in stock'); tone = 'bad'; }
        else if (s.days_left === null) text = t('{units} units · none issued in 30 days', { units: s.units });
        else {
            text = t('{days} days · {units} units', { days: s.days_left, units: s.units });
            tone = s.days_left < SUPPLY_DAYS.CRITICAL ? 'bad' : s.days_left < SUPPLY_DAYS.LOW ? 'warn' : 'ok';
        }
        return { label: s.blood_type, value: s.days_left ?? 0, text, tone };
    });
}
