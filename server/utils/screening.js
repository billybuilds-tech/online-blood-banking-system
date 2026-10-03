import { SCREENING_LIMITS as L } from '../config.js';

/*
 * Donor health screening (WHO, 2012). Two stages:
 *  1. A short questionnaire the donor answers when booking. An answer that shows a reason not to
 *     donate stops the booking and tells the donor what to do (self-deferral).
 *  2. The blood bank's health check on the donation day (see evaluateScreening).
 * Laboratory tests on the donated blood are outside the scope of this system (Section 1.6).
 * Questions and time limits are prototype values to be confirmed with NBTS.
 */
export const QUESTIONS = [
    {
        id: 'feeling_well',
        text: 'Are you feeling healthy and well today?',
        expected: true,
        advice: 'Please book when you are feeling well.',
    },
    {
        id: 'weight_ok',
        text: 'Do you weigh at least {minWeight} kg?',
        expected: true,
        advice: 'Donors must weigh at least {minWeight} kg.',
    },
    {
        id: 'recent_illness',
        text: 'In the last 2 weeks, have you had a fever, malaria or any other infection?',
        expected: false,
        advice: 'Please book once you have been fully well for at least 2 weeks.',
    },
    {
        id: 'medication',
        text: 'Are you taking antibiotics or other medicine prescribed by a doctor?',
        expected: false,
        advice: 'Please finish your treatment first; the blood bank can tell you when you may donate.',
    },
    {
        id: 'pregnancy',
        text: 'Are you pregnant, or have you given birth in the last 6 months? (Answer No if this does not apply.)',
        expected: false,
        advice: 'Please book again at least 6 months after giving birth.',
    },
    {
        id: 'procedure',
        text: 'In the last 6 months, have you had surgery, a tattoo, a piercing or a blood transfusion?',
        expected: false,
        advice: 'Please book again 6 months after the procedure.',
    },
];

export const QUESTION_VARS = { minWeight: L.MIN_WEIGHT_KG };

/*
 * answers: { [questionId]: boolean }.
 * Returns { complete, failed: [questionId…] }; complete is false when a question is unanswered.
 */
export function evaluateQuestionnaire(answers) {
    const values = answers && typeof answers === 'object' ? answers : {};
    const complete = QUESTIONS.every((q) => typeof values[q.id] === 'boolean');
    const failed = QUESTIONS.filter((q) => typeof values[q.id] === 'boolean' && values[q.id] !== q.expected).map((q) => q.id);
    return { complete, failed };
}

// Fields recorded at the donation-day check, with the range a typed value must fall in.
export const SCREENING_FIELDS = {
    weight_kg: [20, 250],
    hemoglobin_g_dl: [3, 25],
    bp_systolic: [50, 260],
    bp_diastolic: [30, 160],
    pulse_bpm: [30, 220],
    temperature_c: [33, 43],
};

// Deferral reasons a blood bank can record; the screening check suggests the first one.
export const DEFERRAL_REASONS = [
    'low_hemoglobin', 'low_weight', 'blood_pressure', 'pulse', 'temperature',
    'recent_illness', 'medication', 'other_medical',
];

// Returns the list of failed checks as deferral reason codes ([] = passed).
export function evaluateScreening(s) {
    const failed = [];
    if (s.hemoglobin_g_dl < L.MIN_HEMOGLOBIN_G_DL) failed.push('low_hemoglobin');
    if (s.weight_kg < L.MIN_WEIGHT_KG) failed.push('low_weight');
    if (s.bp_systolic < L.SYSTOLIC_MM_HG[0] || s.bp_systolic > L.SYSTOLIC_MM_HG[1]
        || s.bp_diastolic < L.DIASTOLIC_MM_HG[0] || s.bp_diastolic > L.DIASTOLIC_MM_HG[1]) failed.push('blood_pressure');
    if (s.pulse_bpm < L.PULSE_BPM[0] || s.pulse_bpm > L.PULSE_BPM[1]) failed.push('pulse');
    if (s.temperature_c > L.MAX_TEMPERATURE_C) failed.push('temperature');
    return failed;
}

// Readable label for each reason (English key, translated where shown).
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
