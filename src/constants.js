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

export function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function todayString() {
    return new Date().toLocaleDateString('en-CA');
}
