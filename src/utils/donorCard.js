import { formatDate } from '../constants.js';
import { translate as t } from '../i18n.jsx';
import { getLang } from '../lang.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Printable donor card at bank-card size (85.6 × 54 mm), in the current language.
export function downloadDonorCard(card) {
    const confirmed = card.blood_type_confirmed_at
        ? t('confirmed by {bank}', { bank: card.blood_type_confirmed_by_name || t('a blood bank') })
        : t('not yet confirmed');
    const html = `<!doctype html>
<html lang="${getLang()}"><head><meta charset="utf-8"><title>${escape(t('Blood donor card'))} ${escape(card.donorNumber)}</title>
<style>
  @page { size: 85.6mm 54mm; margin: 0; }
  body { margin: 0; background: #eee; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
  .card { box-sizing: border-box; width: 85.6mm; height: 54mm; margin: 10mm auto; padding: 4mm 5mm; border-radius: 3mm;
          color: #fff; background: linear-gradient(135deg, #b3202a 0%, #7a0f16 100%); position: relative; overflow: hidden; }
  .card::after { content: ''; position: absolute; right: -14mm; top: -14mm; width: 40mm; height: 40mm; border-radius: 50%; background: rgba(255,255,255,0.08); }
  .top { display: flex; justify-content: space-between; font-size: 2.6mm; text-transform: uppercase; letter-spacing: 0.3mm; opacity: 0.9; }
  .name { font-size: 4.6mm; font-weight: 700; margin-top: 4mm; }
  .number { font-family: Consolas, monospace; font-size: 3.2mm; letter-spacing: 0.4mm; opacity: 0.9; }
  .group { position: absolute; right: 5mm; top: 12mm; text-align: center; }
  .group strong { display: block; font-size: 11mm; line-height: 1; }
  .group span { font-size: 2.2mm; opacity: 0.85; }
  .facts { position: absolute; left: 5mm; right: 5mm; bottom: 4mm; display: flex; justify-content: space-between; font-size: 2.3mm; }
  .facts b { display: block; font-size: 3.2mm; }
  @media print { body { background: none; } .card { margin: 0; } }
</style></head>
<body><div class="card">
  <div class="top"><span>${escape(t('Online Blood Banking System'))}</span><span>${escape(t('Blood donor card'))}</span></div>
  <div class="name">${escape(card.name)}</div>
  <div class="number">${escape(card.donorNumber)}</div>
  <div class="group"><strong>${escape(card.blood_type || '–')}</strong><span>${escape(confirmed)}</span></div>
  <div class="facts">
    <div>${escape(t('Donations'))}<b>${escape(card.donations)}</b></div>
    <div>${escape(t('Badges'))}<b>${escape(card.badge?.label || '–')}</b></div>
    <div>${escape(t('Member since'))}<b>${escape(formatDate(card.member_since))}</b></div>
  </div>
</div></body></html>`;

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `donor-card-${card.donorNumber}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
