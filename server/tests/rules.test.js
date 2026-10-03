// Unit tests for the blood-banking rules (Appendix B). Run: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageOn, checkEligibility, classifyCollection, compatibleDonorTypes, expiryDate } from '../utils/rules.js';
import { QUESTIONS, evaluateQuestionnaire, evaluateScreening } from '../utils/screening.js';
import { selectAppealTargets } from '../utils/appeals.js';
import { badgeReachedAt, currentBadge, donorNumber, nextBadge } from '../utils/recognition.js';

test('UT-01 O- recipient can receive only O-', () => {
    assert.deepEqual(compatibleDonorTypes('O-'), ['O-']);
});

test('UT-02 AB+ recipient can receive all 8 groups', () => {
    assert.equal(compatibleDonorTypes('AB+').length, 8);
});

test('UT-03 A+ recipient cannot receive B or AB', () => {
    const types = compatibleDonorTypes('A+');
    for (const t of ['B+', 'B-', 'AB+', 'AB-']) assert.ok(!types.includes(t), `${t} should be excluded`);
    assert.deepEqual(types.sort(), ['A+', 'A-', 'O+', 'O-'].sort());
});

test('UT-04 unknown blood type gives an empty list', () => {
    assert.deepEqual(compatibleDonorTypes('C+'), []);
});

test('UT-05 age is 25 the day before the birthday and 26 on the birthday', () => {
    assert.equal(ageOn('2000-06-15', '2026-06-14'), 25);
    assert.equal(ageOn('2000-06-15', '2026-06-15'), 26);
});

test('UT-06 donor under 18 is not eligible', () => {
    const result = checkEligibility({ dateOfBirth: '2010-01-01', bookingDate: '2026-10-02' });
    assert.equal(result.eligible, false);
});

test('UT-07 donor over 65 is not eligible', () => {
    const result = checkEligibility({ dateOfBirth: '1955-01-01', bookingDate: '2026-10-02' });
    assert.equal(result.eligible, false);
});

test('UT-08 first-time adult donor is eligible', () => {
    const result = checkEligibility({ dateOfBirth: '1998-03-10', bookingDate: '2026-10-02' });
    assert.equal(result.eligible, true);
});

test('UT-09 donation 30 days after the last is refused with the next date', () => {
    const result = checkEligibility({ dateOfBirth: '1998-03-10', lastDonationDate: '2026-01-01', bookingDate: '2026-01-31' });
    assert.equal(result.eligible, false);
    assert.equal(result.nextEligibleDate, '2026-04-01');
});

test('UT-10 donation exactly 90 days after the last is eligible', () => {
    const result = checkEligibility({ dateOfBirth: '1998-03-10', lastDonationDate: '2026-01-01', bookingDate: '2026-04-01' });
    assert.equal(result.eligible, true);
});

test('UT-11 blood donated on 1 Jan 2026 expires on 5 Feb 2026', () => {
    assert.equal(expiryDate('2026-01-01'), '2026-02-05');
});

test('UT-12 405 to 495 mL is a standard unit', () => {
    for (const ml of [405, 450, 495]) assert.equal(classifyCollection(ml), 'standard', `${ml} mL`);
});

test('UT-13 300 to 404 mL is a low-volume unit', () => {
    for (const ml of [300, 350, 404]) assert.equal(classifyCollection(ml), 'low_volume', `${ml} mL`);
});

test('UT-14 below 300 mL is an incomplete collection', () => {
    for (const ml of [0, 150, 299]) assert.equal(classifyCollection(ml), 'incomplete', `${ml} mL`);
});

test('UT-15 above 495 mL is outside the accepted range', () => {
    assert.equal(classifyCollection(496), 'over_volume');
});

const NORMAL = { weight_kg: 62, hemoglobin_g_dl: 13.4, bp_systolic: 118, bp_diastolic: 76, pulse_bpm: 72, temperature_c: 36.6 };

test('UT-16 a normal donation-day health check passes', () => {
    assert.deepEqual(evaluateScreening(NORMAL), []);
});

test('UT-17 low haemoglobin, low weight and fever each fail the health check', () => {
    assert.deepEqual(evaluateScreening({ ...NORMAL, hemoglobin_g_dl: 12.4 }), ['low_hemoglobin']);
    assert.deepEqual(evaluateScreening({ ...NORMAL, weight_kg: 49 }), ['low_weight']);
    assert.deepEqual(evaluateScreening({ ...NORMAL, temperature_c: 38 }), ['temperature']);
    assert.deepEqual(evaluateScreening({ ...NORMAL, hemoglobin_g_dl: 12.5, weight_kg: 50 }), [], 'limits themselves pass');
});

test('UT-18 blood pressure and pulse outside the safe range fail the health check', () => {
    assert.deepEqual(evaluateScreening({ ...NORMAL, bp_systolic: 190 }), ['blood_pressure']);
    assert.deepEqual(evaluateScreening({ ...NORMAL, bp_diastolic: 45 }), ['blood_pressure']);
    assert.deepEqual(evaluateScreening({ ...NORMAL, pulse_bpm: 110 }), ['pulse']);
});

test('UT-19 questionnaire: all safe answers pass, a risky or missing answer is reported', () => {
    const safe = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.expected]));
    assert.deepEqual(evaluateQuestionnaire(safe), { complete: true, failed: [] });
    assert.deepEqual(evaluateQuestionnaire({ ...safe, recent_illness: true }), { complete: true, failed: ['recent_illness'] });
    const { feeling_well: _omit, ...missing } = safe;
    assert.equal(evaluateQuestionnaire(missing).complete, false);
});

test('UT-20 appeals go only to donors who could donate today', () => {
    const base = { date_of_birth: '1995-01-01', last_donation: null, deferred: false, has_open: false };
    const people = [
        { id: 1, ...base },                              // never donated: eligible
        { id: 2, ...base, last_donation: '2026-09-01' }, // 32 days ago
        { id: 3, ...base, deferred: true },
        { id: 4, ...base, has_open: true },
        { id: 5, ...base, date_of_birth: '2010-01-01' }, // under 18
        { id: 6, ...base, last_donation: '2026-07-05' }, // exactly 90 days ago: eligible
    ];
    assert.deepEqual(selectAppealTargets(people, '2026-10-03').map((p) => p.id), [1, 6]);
});

test('UT-21 badges at 1, 5, 10, 25 and 50 donations; donor number format', () => {
    assert.equal(currentBadge(0), null);
    assert.equal(currentBadge(1).id, 'first');
    assert.equal(currentBadge(9).id, 'bronze');
    assert.equal(currentBadge(60).id, 'platinum');
    assert.deepEqual([nextBadge(3).id, nextBadge(3).remaining], ['bronze', 2]);
    assert.equal(nextBadge(50), null);
    assert.equal(badgeReachedAt(10).id, 'silver');
    assert.equal(badgeReachedAt(11), null);
    assert.equal(donorNumber(42), 'OBBS-D-000042');
});
