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

export function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function todayString() {
    return new Date().toLocaleDateString('en-CA');
}
