// Unit tests for the blood-banking rules (Appendix B). Run: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageOn, checkEligibility, classifyCollection, compatibleDonorTypes, expiryDate } from '../utils/rules.js';

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
