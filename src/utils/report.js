import { ROLE_LABELS } from '../constants.js';

const RED = [165, 29, 36];

// Monthly system report for the Blood Bank Manager (FR09).
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
        if (!rows.length) { doc.text('No records', 15, y); y += 6; return; }
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
    const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    doc.setFillColor(...RED).rect(0, 0, 210, 12, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(16).text('Online Blood Banking System', 15, y + 4);
    y += 11;
    doc.setFont('helvetica', 'normal').setFontSize(11).text(`Monthly report: ${monthName}`, 15, y);
    y += 5;
    doc.setFontSize(9).setTextColor(100).text(`Generated ${new Date(summary.generatedAt).toLocaleString('en-GB')}`, 15, y);
    doc.setTextColor(0);
    y += 4;

    heading('Activity this month');
    const count = (group, status) => group[status]?.total ?? 0;
    const unitsOf = (group, status) => group[status]?.units ?? 0;
    table(['Measure', 'Count', 'Units'], [
        ['Verified donations', summary.donations.total, summary.donations.units],
        ['  standard units (405-495 mL)', summary.collections.standard, summary.collections.standard],
        ['  low-volume units (300-404 mL, red cells only)', summary.collections.low_volume, summary.collections.low_volume],
        ['Incomplete collections (not added to stock)', summary.collections.incomplete, '-'],
        ['Donation appointments booked', Object.values(summary.appointments).reduce((s, v) => s + v.total, 0), '-'],
        ['Blood requests received', Object.values(summary.requests).reduce((s, v) => s + v.total, 0), Object.values(summary.requests).reduce((s, v) => s + v.units, 0)],
        ['  approved', count(summary.requests, 'approved'), unitsOf(summary.requests, 'approved')],
        ['  rejected', count(summary.requests, 'rejected'), unitsOf(summary.requests, 'rejected')],
        ['  pending', count(summary.requests, 'pending'), unitsOf(summary.requests, 'pending')],
        ['Inter-bank transfers approved', count(summary.transfers, 'approved'), unitsOf(summary.transfers, 'approved')],
    ], [110, 35, 35]);

    heading('Current stock by blood group (all approved banks)');
    table(['Blood group', 'Units'], summary.stock.map((s) => [s.blood_type, s.units]), [110, 35]);

    heading('Stock by blood bank');
    table(['Blood bank', 'Region', 'Total units'], summary.banks.map((b) => [b.name, b.region, b.total_units]), [90, 55, 35]);

    heading(`Low stock (below ${summary.lowStockThreshold} units)`);
    table(['Blood bank', 'Blood group', 'Units'], summary.lowStock.map((l) => [l.bank_name, l.blood_type, l.units]), [110, 35, 35]);

    heading('Registered users');
    table(['Role', 'Status', 'Users'], summary.users.map((u) => [ROLE_LABELS[u.role], u.status, u.total]), [90, 55, 35]);

    doc.save(`OBBS-report-${summary.month}.pdf`);
}
