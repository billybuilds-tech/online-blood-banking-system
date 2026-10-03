import { useState } from 'react';
import { Badge, Field, Loading } from '../../components/ui.jsx';
import { BLOOD_TYPES, COLLECTION_LABELS, VOLUME, classifyCollection } from '../../constants.js';
import { useScreening } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';

/*
 * Donation-day health check (limits come from the server). Blood can be collected only when every
 * measurement passes; otherwise, or whenever the staff decide, the donor is deferred.
 */

const FIELD_REASON = {
    weight_kg: 'low_weight',
    hemoglobin_g_dl: 'low_hemoglobin',
    bp_systolic: 'blood_pressure',
    bp_diastolic: 'blood_pressure',
    pulse_bpm: 'pulse',
    temperature_c: 'temperature',
};

function passes(field, value, L) {
    switch (field) {
        case 'weight_kg': return value >= L.MIN_WEIGHT_KG;
        case 'hemoglobin_g_dl': return value >= L.MIN_HEMOGLOBIN_G_DL;
        case 'bp_systolic': return value >= L.SYSTOLIC_MM_HG[0] && value <= L.SYSTOLIC_MM_HG[1];
        case 'bp_diastolic': return value >= L.DIASTOLIC_MM_HG[0] && value <= L.DIASTOLIC_MM_HG[1];
        case 'pulse_bpm': return value >= L.PULSE_BPM[0] && value <= L.PULSE_BPM[1];
        case 'temperature_c': return value <= L.MAX_TEMPERATURE_C;
        default: return true;
    }
}

function limitText(field, L) {
    switch (field) {
        case 'weight_kg': return `≥ ${L.MIN_WEIGHT_KG}`;
        case 'hemoglobin_g_dl': return `≥ ${L.MIN_HEMOGLOBIN_G_DL}`;
        case 'bp_systolic': return `${L.SYSTOLIC_MM_HG[0]}–${L.SYSTOLIC_MM_HG[1]}`;
        case 'bp_diastolic': return `${L.DIASTOLIC_MM_HG[0]}–${L.DIASTOLIC_MM_HG[1]}`;
        case 'pulse_bpm': return `${L.PULSE_BPM[0]}–${L.PULSE_BPM[1]}`;
        case 'temperature_c': return `≤ ${L.MAX_TEMPERATURE_C}`;
        default: return '';
    }
}

export default function DonationDayForm({ appointment, busy, onComplete, onDefer, onCancel }) {
    const { t } = useI18n();
    const screening = useScreening();
    const [values, setValues] = useState({});
    const [bloodType, setBloodType] = useState(appointment.blood_type);
    const [volume, setVolume] = useState(String(VOLUME.BAG));
    const [mode, setMode] = useState('check');
    const [deferral, setDeferral] = useState({ reason: '', days: 28, permanent: false, notes: '' });

    if (!screening.data) return <Loading />;
    const { fields, limits, reasons } = screening.data;
    const reasonLabel = Object.fromEntries(reasons.map((r) => [r.code, r.label]));

    const numbers = Object.fromEntries(fields.map((f) => {
        const raw = values[f.id];
        return [f.id, raw === undefined || raw === '' ? null : Number(raw)];
    }));
    const filled = fields.every((f) => Number.isFinite(numbers[f.id]));
    const failed = [...new Set(fields
        .filter((f) => Number.isFinite(numbers[f.id]) && !passes(f.id, numbers[f.id], limits))
        .map((f) => FIELD_REASON[f.id]))];
    const passed = filled && failed.length === 0;

    const ml = Number(volume);
    const volumeValid = volume !== '' && Number.isInteger(ml) && ml >= 0;
    const kind = volumeValid ? classifyCollection(ml) : null;

    function startDeferral() {
        setDeferral((d) => ({ ...d, reason: d.reason || failed[0] || 'other_medical' }));
        setMode('defer');
    }

    return (
        <div className="dday">
            <div className="dday-head">
                <h3>{t('Donation-day check: {name}', { name: appointment.donor_name })}</h3>
                <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>{t('Cancel')}</button>
            </div>
            <p className="muted small">{t("Ask the health questions again, then record today's measurements. Blood can be collected only when every check passes.")}</p>

            <div className="dday-grid">
                {fields.map((f) => {
                    const value = numbers[f.id];
                    const ok = Number.isFinite(value) ? passes(f.id, value, limits) : null;
                    return (
                        <label key={f.id} className={`dday-field ${ok === false ? 'bad' : ''} ${ok ? 'good' : ''}`}>
                            <span className="field-label">{f.label}</span>
                            <input type="number" step="any" min={f.range[0]} max={f.range[1]} value={values[f.id] ?? ''}
                                onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} />
                            <span className="dday-limit">{ok === null ? '' : ok ? '✓ ' : '✗ '}{limitText(f.id, limits)}</span>
                        </label>
                    );
                })}
            </div>

            <Field label={t('Blood group confirmed by the grouping test')}
                hint={bloodType === appointment.blood_type
                    ? t('The donor entered {type}', { type: appointment.blood_type })
                    : t('Differs from the group the donor entered ({type})', { type: appointment.blood_type })}>
                <select value={bloodType} onChange={(e) => setBloodType(e.target.value)} className="dday-select">
                    {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                </select>
            </Field>

            {mode === 'check' && (
                <div className="stack">
                    {filled && !passed && (
                        <div className="alert alert-error">
                            {t('Health check not passed: {checks}. Defer the donor; do not collect blood.', {
                                checks: failed.map((r) => reasonLabel[r]).join(', '),
                            })}
                        </div>
                    )}
                    {passed && (
                        <div className="dday-collect">
                            <label className="verify-input">
                                <span className="field-label">{t('Collected volume')}</span>
                                <input type="number" min={0} max={VOLUME.STANDARD_MAX} step={1} value={volume}
                                    onChange={(e) => setVolume(e.target.value)} aria-label={t('Collected volume in mL')} />
                                <span>mL</span>
                            </label>
                            {kind && <Badge value={kind}>{t(COLLECTION_LABELS[kind])}</Badge>}
                            <button type="button" className="btn btn-sm btn-primary" disabled={busy || !volumeValid || kind === 'over_volume'}
                                onClick={() => onComplete({ volume_ml: ml, screening: numbers, blood_type: bloodType })}>
                                {t('Save donation')}
                            </button>
                        </div>
                    )}
                    <div>
                        <button type="button" className={passed ? 'btn btn-sm btn-ghost' : 'btn btn-sm btn-danger'} onClick={startDeferral}>
                            {t('Defer donor')}
                        </button>
                    </div>
                </div>
            )}

            {mode === 'defer' && (
                <div className="dday-defer stack">
                    <div className="form-grid">
                        <Field label={t('Reason')}>
                            <select value={deferral.reason} onChange={(e) => setDeferral({ ...deferral, reason: e.target.value })}>
                                {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                            </select>
                        </Field>
                        {!deferral.permanent && (
                            <Field label={t('Days before the donor may donate again')}>
                                <input type="number" min={1} max={3650} value={deferral.days}
                                    onChange={(e) => setDeferral({ ...deferral, days: e.target.value })} />
                            </Field>
                        )}
                    </div>
                    <label className="check">
                        <input type="checkbox" checked={deferral.permanent} onChange={(e) => setDeferral({ ...deferral, permanent: e.target.checked })} />
                        {t('Permanent: the donor cannot donate at present')}
                    </label>
                    <Field label={t('Notes (optional)')} hint={t('Only blood bank staff see these notes.')}>
                        <input maxLength={255} value={deferral.notes} onChange={(e) => setDeferral({ ...deferral, notes: e.target.value })} />
                    </Field>
                    <div className="actions">
                        <button type="button" className="btn btn-sm btn-danger" disabled={busy || !deferral.reason}
                            onClick={() => onDefer({
                                reason: deferral.reason,
                                permanent: deferral.permanent,
                                deferral_days: deferral.permanent ? undefined : Number(deferral.days),
                                notes: deferral.notes,
                                screening: filled ? numbers : undefined,
                            })}>
                            {t('Defer donor')}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode('check')}>{t('Back')}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
