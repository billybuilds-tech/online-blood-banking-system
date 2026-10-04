import { useState } from 'react';
import { BarChart, HorizontalBars } from '../../components/Charts.jsx';
import { Alert, Card, Empty, Loading, Stat } from '../../components/ui.jsx';
import { SUPPLY_DAYS, TREND_CHARTS, addMonths, formatMonth, supplyRows } from '../../constants.js';
import { useApi } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';

// Trends for the Blood Bank Manager (Recommendation 2): donations, requests, bags and days of supply.
export default function Statistics() {
    const { t } = useI18n();
    const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
    const [filters, setFilters] = useState({ from: addMonths(thisMonth, -11), to: thisMonth, bankId: '' });
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const trends = useApi(`/reports/trends?${query}`);
    const banks = useApi('/users?role=bloodbank&status=approved');
    const d = trends.data;
    const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
    const rowsOf = (id) => d[id].map((r) => ({ ...r, label: id === 'groups' ? r.blood_type : formatMonth(r.month) }));
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
                    {TREND_CHARTS.map((chart) => (
                        <Card key={chart.id} title={t(chart.title)}>
                            <BarChart stacked={chart.stacked} title={t(chart.title)} data={rowsOf(chart.id)}
                                series={chart.series.map((s) => ({ ...s, label: t(s.label) }))} />
                        </Card>
                    ))}
                </div>
            )}

            {d && (
                <Card title={t('Days of supply by blood group')}>
                    <p className="muted small">
                        {t('Current stock divided by the units issued per day over the last 30 days. A full bar means 30 days or more; below {critical} days is critical and below {low} days is low.',
                            { critical: SUPPLY_DAYS.CRITICAL, low: SUPPLY_DAYS.LOW })}
                    </p>
                    <HorizontalBars max={SUPPLY_DAYS.SCALE} rows={supplyRows(d.supply, t)} />
                </Card>
            )}
        </>
    );
}
