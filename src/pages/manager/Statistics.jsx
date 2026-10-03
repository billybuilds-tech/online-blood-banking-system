import { useState } from 'react';
import { BarChart, HorizontalBars } from '../../components/Charts.jsx';
import { Alert, Card, Empty, Loading, Stat } from '../../components/ui.jsx';
import { formatMonth } from '../../constants.js';
import { useApi } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';

const COLORS = { green: '#2e8b57', amber: '#e3a020', red: '#b31b2a', blue: '#2f6fb3', grey: '#9a8f8c', lightBlue: '#8fa9d6' };
// Days of supply below these are shown as critical and low (prototype values).
const CRITICAL_DAYS = 3;
const LOW_DAYS = 7;
// Days-of-supply bars run from 0 to this many days; a full bar means this long or more.
const DAYS_SCALE = 30;

function monthsBefore(month, n) {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
}

// Trends for the Blood Bank Manager (Recommendation 2): donations, requests, bags and days of supply.
export default function Statistics() {
    const { t } = useI18n();
    const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
    const [filters, setFilters] = useState({ from: monthsBefore(thisMonth, 11), to: thisMonth, bankId: '' });
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const trends = useApi(`/reports/trends?${query}`);
    const banks = useApi('/users?role=bloodbank&status=approved');
    const d = trends.data;
    const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
    const label = (rows) => rows.map((r) => ({ ...r, label: formatMonth(r.month) }));
    const empty = d && !d.totals.donations && !d.totals.requests && !d.totals.issued_bags && !d.totals.wasted_bags;

    return (
        <>
            <Card title={t('Statistics')} actions={
                <div className="filters">
                    <label className="small muted">{t('From')} <input type="month" value={filters.from} max={filters.to} onChange={set('from')} /></label>
                    <label className="small muted">{t('To')} <input type="month" value={filters.to} min={filters.from} onChange={set('to')} /></label>
                    <select value={filters.bankId} onChange={set('bankId')} aria-label={t('Blood bank')}>
                        <option value="">{t('All blood banks')}</option>
                        {(banks.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            }>
                <Alert message={trends.error ? { type: 'error', text: trends.error } : null} />
                {!d && !trends.error && <Loading />}
                {d && (
                    <div className="stats">
                        <Stat label={t('Verified donations')} value={d.totals.donations} />
                        <Stat label={t('Blood requests')} value={d.totals.requests}
                            hint={d.totals.approval_rate === null ? undefined : t('{rate}% approved', { rate: d.totals.approval_rate })} />
                        <Stat label={t('Average time to answer a request')}
                            value={d.totals.avg_response_hours === null ? '–' : t('{hours} h', { hours: d.totals.avg_response_hours })} />
                        <Stat label={t('Bags expired or discarded')} value={d.totals.wasted_bags}
                            tone={d.totals.wastage_rate > 10 ? 'warn' : d.totals.wastage_rate === null ? undefined : 'good'}
                            hint={d.totals.wastage_rate === null ? undefined : t('{rate}% of the bags that left stock', { rate: d.totals.wastage_rate })} />
                    </div>
                )}
                {empty && <Empty>{t('No donations, requests or bag movements in this period.')}</Empty>}
            </Card>

            {d && !empty && (
                <div className="chart-pair">
                    <Card title={t('Verified donations per month')}>
                        <BarChart stacked title={t('Verified donations per month')} data={label(d.donations)} series={[
                            { key: 'standard', label: t('Standard units'), color: COLORS.green },
                            { key: 'low_volume', label: t('Low-volume units'), color: COLORS.amber },
                        ]} />
                    </Card>
                    <Card title={t('Blood requests per month')}>
                        <BarChart stacked title={t('Blood requests per month')} data={label(d.requests)} series={[
                            { key: 'approved', label: t('Approved'), color: COLORS.green },
                            { key: 'rejected', label: t('Rejected'), color: COLORS.red },
                            { key: 'pending', label: t('Pending'), color: COLORS.grey },
                        ]} />
                    </Card>
                    <Card title={t('Units requested and issued by blood group')}>
                        <BarChart title={t('Units requested and issued by blood group')}
                            data={d.groups.map((g) => ({ ...g, label: g.blood_type }))} series={[
                                { key: 'requested', label: t('Requested'), color: COLORS.lightBlue },
                                { key: 'issued', label: t('Issued'), color: COLORS.red },
                            ]} />
                    </Card>
                    <Card title={t('Bags leaving stock each month')}>
                        <BarChart stacked title={t('Bags leaving stock each month')} data={label(d.bags)} series={[
                            { key: 'issued', label: t('Issued to patients'), color: COLORS.blue },
                            { key: 'expired', label: t('Expired'), color: COLORS.grey },
                            { key: 'discarded', label: t('Discarded'), color: COLORS.red },
                        ]} />
                    </Card>
                </div>
            )}

            {d && (
                <Card title={t('Days of supply by blood group')}>
                    <p className="muted small">
                        {t('Current stock divided by the units issued per day over the last 30 days. A full bar means 30 days or more; below {critical} days is critical and below {low} days is low.',
                            { critical: CRITICAL_DAYS, low: LOW_DAYS })}
                    </p>
                    <HorizontalBars max={DAYS_SCALE} rows={d.supply.map((s) => {
                        let text;
                        let tone = 'ok';
                        if (!s.units) { text = t('None in stock'); tone = 'bad'; }
                        else if (s.days_left === null) text = t('{units} units · none issued in 30 days', { units: s.units });
                        else {
                            text = t('{days} days · {units} units', { days: s.days_left, units: s.units });
                            tone = s.days_left < CRITICAL_DAYS ? 'bad' : s.days_left < LOW_DAYS ? 'warn' : 'ok';
                        }
                        return { label: s.blood_type, value: s.days_left ?? 0, text, tone };
                    })} />
                </Card>
            )}
        </>
    );
}
