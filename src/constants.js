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
