import { formatDate } from '../constants.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Builds a printable HTML certificate for one verified donation and downloads it.
export function downloadCertificate(donation, donorName) {
    const number = `OBBS-${donation.donation_date.replaceAll('-', '')}-${String(donation.id).padStart(5, '0')}`;
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Blood Donation Certificate ${number}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #f4efe9; color: #2a1d1d; }
  .cert { box-sizing: border-box; width: 297mm; min-height: 210mm; margin: 0 auto; padding: 18mm 22mm; background: #fffdf9;
          border: 3mm solid #a51d24; outline: 1mm solid #e6c9a8; outline-offset: -7mm; text-align: center; position: relative; }
  .drop { width: 22mm; height: 22mm; margin: 0 auto 4mm; }
  h1 { font-size: 30pt; letter-spacing: 2px; margin: 0; color: #a51d24; text-transform: uppercase; }
  h2 { font-weight: normal; font-size: 13pt; margin: 2mm 0 10mm; letter-spacing: 4px; text-transform: uppercase; color: #6b5555; }
  .name { font-size: 28pt; font-style: italic; margin: 6mm auto; border-bottom: 1px solid #c9b6a3; display: inline-block; padding: 0 12mm 2mm; }
  p { font-size: 13pt; line-height: 1.6; max-width: 210mm; margin: 0 auto; }
  .facts { display: flex; justify-content: center; gap: 14mm; margin: 10mm 0; font-size: 11pt; }
  .facts div span { display: block; color: #6b5555; font-size: 9pt; text-transform: uppercase; letter-spacing: 1px; }
  .facts strong { font-size: 14pt; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14mm; font-size: 10pt; }
  .sign { border-top: 1px solid #2a1d1d; padding-top: 2mm; width: 70mm; }
  .no { color: #6b5555; font-size: 9pt; }
  @media print { body { background: none; } }
</style></head>
<body><div class="cert">
  <svg class="drop" viewBox="0 0 32 32"><path d="M16 2C16 2 6 14 6 20a10 10 0 0 0 20 0C26 14 16 2 16 2z" fill="#a51d24"/></svg>
  <h1>Certificate of Blood Donation</h1>
  <h2>Online Blood Banking System</h2>
  <p>This certificate is proudly presented to</p>
  <div class="name">${escape(donorName)}</div>
  <p>in grateful recognition of a voluntary, unpaid blood donation that may help save the lives of patients in need.</p>
  <div class="facts">
    <div><span>Date of donation</span><strong>${escape(formatDate(donation.donation_date))}</strong></div>
    <div><span>Blood group</span><strong>${escape(donation.blood_type)}</strong></div>
    <div><span>Units</span><strong>${escape(donation.units)}</strong></div>
    <div><span>Blood bank</span><strong>${escape(donation.bank_name)}</strong></div>
  </div>
  <div class="footer">
    <div class="no">Certificate no. ${escape(number)}</div>
    <div class="sign">${escape(donation.bank_name)}<br>Authorised signature</div>
  </div>
</div></body></html>`;

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `blood-donation-certificate-${number}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
