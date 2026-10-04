import { niceScale } from '../components/Charts.jsx';
import { CHART_COLORS, ROLE_LABELS, SUPPLY_DAYS, TREND_CHARTS, VOLUME, supplyRows } from '../constants.js';
import { translate as t } from '../i18n.jsx';
import { getLocale } from '../lang.js';

const RED = [165, 29, 36];
const TONE_COLORS = { ok: CHART_COLORS.green, warn: CHART_COLORS.amber, bad: CHART_COLORS.red };

// A chart's title, wrapped to the chart's width. Returns the extra height taken by wrapped lines.
function drawTitle(doc, title, x, y, w) {
    const lines = doc.setFont('helvetica', 'bold').setFontSize(8.5).splitTextToSize(title, w);
    doc.setTextColor(0).text(lines, x, y + 3);
    return (lines.length - 1) * 3.6;
}

// Legend under a chart: a colour square (or a dashed line) and a label for each item, wrapped to the width.
function drawLegend(doc, items, x, y, w) {
    doc.setFont('helvetica', 'normal').setFontSize(6.5);
    let lx = x;
    let ly = y;
    for (const item of items) {
        const width = 3.4 + doc.getTextWidth(item.label);
        if (lx > x && lx + width > x + w) { lx = x; ly += 3.4; }
        if (item.dashed) {
            doc.setDrawColor(item.color).setLineWidth(0.4).setLineDashPattern([0.8, 0.6], 0).line(lx, ly - 1, lx + 2.6, ly - 1);
            doc.setLineDashPattern([], 0);
        } else {
            doc.setFillColor(item.color).rect(lx, ly - 2.2, 2.4, 2.4, 'F');
        }
        doc.setTextColor(90).text(item.label, lx + 3.4, ly);
        lx += width + 4;
    }
}

/*
 * Vertical bars in a w x h mm box at (x, y), laid out like BarChart in components/Charts.jsx.
 * rows: [{ label, [series.key]: number }]; line: optional dashed level { value, label, color }.
 */
function drawBarChart(doc, { x, y, w, h, title, rows, series, stacked = false, line = null }) {
    const extra = drawTitle(doc, title, x, y, w);
    const box = { left: x + 8, top: y + 8 + extra, width: w - 9, height: h - 8 - extra - 13 };
    const value = (row, key) => Number(row[key]) || 0;
    const highest = Math.max(line?.value ?? 0, ...rows.map((row) => (stacked
        ? series.reduce((sum, s) => sum + value(row, s.key), 0)
        : Math.max(0, ...series.map((s) => value(row, s.key))))));
    const { max, ticks } = niceScale(highest);
    const yOf = (v) => box.top + box.height - (v / max) * box.height;

    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(110).setLineWidth(0.15);
    for (const tick of ticks) {
        doc.setDrawColor(232).line(box.left, yOf(tick), box.left + box.width, yOf(tick));
        doc.text(String(tick), box.left - 1.5, yOf(tick) + 1, { align: 'right' });
    }
    const band = box.width / rows.length;
    const barWidth = stacked ? band * 0.62 : (band * 0.8) / series.length;
    rows.forEach((row, i) => {
        const x0 = box.left + i * band;
        let stackTop = 0;
        series.forEach((s, j) => {
            const v = value(row, s.key);
            if (!v) return;
            const top = stacked ? stackTop + v : v;
            const bottom = stacked ? stackTop : 0;
            if (stacked) stackTop += v;
            const bx = stacked ? x0 + (band - barWidth) / 2 : x0 + band * 0.1 + j * barWidth;
            doc.setFillColor(s.color).rect(bx, yOf(top), Math.max(0.3, barWidth - 0.3), yOf(bottom) - yOf(top), 'F');
        });
        doc.setTextColor(110).text(row.label, x0 + band / 2, box.top + box.height + 3.5, { align: 'center' });
    });
    doc.setDrawColor(180).line(box.left, yOf(0), box.left + box.width, yOf(0));
    if (line) {
        doc.setDrawColor(line.color).setLineWidth(0.35).setLineDashPattern([1, 0.8], 0)
            .line(box.left, yOf(line.value), box.left + box.width, yOf(line.value));
        doc.setLineDashPattern([], 0).setLineWidth(0.15);
    }
    drawLegend(doc, [...series, ...(line ? [{ ...line, dashed: true }] : [])], x, box.top + box.height + 8, w);
}

// Horizontal bars with the value written beside each one, like HorizontalBars in components/Charts.jsx.
function drawHorizontalBars(doc, { x, y, w, h, title, rows, max }) {
    const extra = drawTitle(doc, title, x, y, w);
    const rowHeight = (h - 9 - extra) / rows.length;
    const trackX = x + 9;
    const trackWidth = w - 9 - 34;
    rows.forEach((r, i) => {
        const cy = y + 9 + extra + i * rowHeight + rowHeight / 2;
        doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(40).text(r.label, x, cy + 1);
        doc.setFillColor(240, 236, 235).roundedRect(trackX, cy - 1.5, trackWidth, 3, 1.5, 1.5, 'F');
        const fill = Math.min(1, (r.value || 0) / max) * trackWidth;
        if (fill > 0) doc.setFillColor(TONE_COLORS[r.tone]).roundedRect(trackX, cy - 1.5, Math.max(3, fill), 3, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(90).text(r.text, trackX + trackWidth + 2, cy + 1, { maxWidth: 32 });
    });
}

// A page of charts: current stock and days of supply, then the trends of the months in `trends`.
function drawCharts(doc, summary, trends) {
    const monthYear = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' });
    doc.addPage();
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...RED).text(t('Charts'), 15, 20);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(90)
        .text(t('Trends from {from} to {to}. Stock and days of supply are as they are today.', {
            from: monthYear(trends.from), to: monthYear(trends.to),
        }), 15, 25.5);

    const width = 87;
    const height = 72;
    const cell = (i) => ({ x: i % 2 ? 108 : 15, y: 31 + Math.floor(i / 2) * (height + 4), w: width, h: height });
    const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString(getLocale(), { month: 'short' });

    drawBarChart(doc, {
        ...cell(0),
        title: t('Current stock by blood group (all approved banks)'),
        rows: trends.supply.map((s) => ({ label: s.blood_type, units: s.units })),
        series: [{ key: 'units', label: t('Units in stock'), color: CHART_COLORS.red }],
        line: {
            value: summary.lowStockThreshold,
            label: t('Low stock (below {count} units)', { count: summary.lowStockThreshold }),
            color: CHART_COLORS.amber,
        },
    });
    drawHorizontalBars(doc, {
        ...cell(1), title: t('Days of supply by blood group'), rows: supplyRows(trends.supply, t), max: SUPPLY_DAYS.SCALE,
    });
    TREND_CHARTS.forEach((chart, i) => {
        drawBarChart(doc, {
            ...cell(i + 2),
            title: t(chart.title),
            stacked: chart.stacked,
            rows: trends[chart.id].map((r) => ({ ...r, label: chart.id === 'groups' ? r.blood_type : monthLabel(r.month) })),
            series: chart.series.map((s) => ({ ...s, label: t(s.label) })),
        });
    });
}

/*
 * Monthly system report for the Blood Bank Manager (FR09), in the current interface language.
 * trends (from /reports/trends) adds a page of charts; without it the report has the tables only.
 * jsPDF is loaded only when a report is generated, so other users never download it.
 */
export async function downloadMonthlyReport(summary, trends = null) {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 20;

    const ensureSpace = (needed) => {
        if (y + needed > pageHeight - 15) { doc.addPage(); y = 20; }
    };

    const heading = (text) => {
        ensureSpace(14);
        y += 4;
        doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...RED).text(text, 15, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
    };

    const table = (columns, rows, widths) => {
        doc.setFontSize(9);
        ensureSpace(8);
        doc.setFont('helvetica', 'bold');
        let x = 15;
        columns.forEach((c, i) => { doc.text(String(c), x, y); x += widths[i]; });
        y += 1.5;
        doc.setDrawColor(200).line(15, y, 195, y);
        y += 4.5;
        doc.setFont('helvetica', 'normal');
        if (!rows.length) { doc.text(t('No records'), 15, y); y += 6; return; }
        for (const row of rows) {
            ensureSpace(6);
            x = 15;
            row.forEach((cell, i) => {
                const text = doc.splitTextToSize(String(cell ?? '-'), widths[i] - 2)[0];
                doc.text(text, x, y);
                x += widths[i];
            });
            y += 5.5;
        }
    };

    const [year, month] = summary.month.split('-');
    const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString(getLocale(), { month: 'long', year: 'numeric' });

    doc.setFillColor(...RED).rect(0, 0, 210, 12, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(16).text(t('Online Blood Banking System'), 15, y + 4);
    y += 11;
    doc.setFont('helvetica', 'normal').setFontSize(11).text(t('Monthly report: {month}', { month: monthName }), 15, y);
    y += 5;
    doc.setFontSize(9).setTextColor(100)
        .text(t('Generated {date}', { date: new Date(summary.generatedAt).toLocaleString(getLocale()) }), 15, y);
    doc.setTextColor(0);
    y += 4;

    heading(t('Activity this month'));
    const count = (group, status) => group[status]?.total ?? 0;
    const unitsOf = (group, status) => group[status]?.units ?? 0;
    const sum = (group, key) => Object.values(group).reduce((s, v) => s + v[key], 0);
    table([t('Measure'), t('Count'), t('Units')], [
        [t('Verified donations'), summary.donations.total, summary.donations.units],
        [`  ${t('standard units ({min}-{max} mL)', { min: VOLUME.STANDARD_MIN, max: VOLUME.STANDARD_MAX })}`,
            summary.collections.standard, summary.collections.standard],
        [`  ${t('low-volume units ({min}-{max} mL, red cells only)', { min: VOLUME.LOW_MIN, max: VOLUME.STANDARD_MIN - 1 })}`,
            summary.collections.low_volume, summary.collections.low_volume],
        [t('Incomplete collections (not added to stock)'), summary.collections.incomplete, '-'],
        [t('Donors deferred at the health check'), summary.deferrals.total, '-'],
        [t('Donation appointments booked'), sum(summary.appointments, 'total'), '-'],
        [t('Blood requests received'), sum(summary.requests, 'total'), sum(summary.requests, 'units')],
        [`  ${t('approved')}`, count(summary.requests, 'approved'), unitsOf(summary.requests, 'approved')],
        [`  ${t('rejected')}`, count(summary.requests, 'rejected'), unitsOf(summary.requests, 'rejected')],
        [`  ${t('pending')}`, count(summary.requests, 'pending'), unitsOf(summary.requests, 'pending')],
        [t('Inter-bank transfers approved'), count(summary.transfers, 'approved'), unitsOf(summary.transfers, 'approved')],
    ], [110, 35, 35]);

    heading(t('Current stock by blood group (all approved banks)'));
    table([t('Blood group'), t('Units')], summary.stock.map((s) => [s.blood_type, s.units]), [110, 35]);

    heading(t('Stock by blood bank'));
    table([t('Blood bank'), t('Region'), t('Total units')], summary.banks.map((b) => [b.name, b.region, b.total_units]), [90, 55, 35]);

    heading(t('Low stock (below {count} units)', { count: summary.lowStockThreshold }));
    table([t('Blood bank'), t('Blood group'), t('Units')], summary.lowStock.map((l) => [l.bank_name, l.blood_type, l.units]), [110, 35, 35]);

    heading(t('Registered users'));
    table([t('Role'), t('Status'), t('Users')], summary.users.map((u) => [t(ROLE_LABELS[u.role]), t(u.status), u.total]), [90, 55, 35]);

    if (trends) drawCharts(doc, summary, trends);

    doc.save(`OBBS-report-${summary.month}.pdf`);
}
