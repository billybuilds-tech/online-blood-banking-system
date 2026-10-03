import { ROLE_LABELS, VOLUME } from '../constants.js';
import { translate as t } from '../i18n.jsx';
import { getLocale } from '../lang.js';

const RED = [165, 29, 36];

// Monthly system report for the Blood Bank Manager (FR09), in the current interface language.
// jsPDF is loaded only when a report is generated, so other users never download it.
export async function downloadMonthlyReport(summary) {
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

    doc.save(`OBBS-report-${summary.month}.pdf`);
}
