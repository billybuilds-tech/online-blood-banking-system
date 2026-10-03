import { formatDate } from '../constants.js';
import { useI18n } from '../i18n.jsx';
import { downloadDonorCard } from '../utils/donorCard.js';
import { Card, Loading } from './ui.jsx';

// Digital donor card (as in eProgesa, Kenya) and recognition badges (Recommendation 9).
export default function DonorCard({ card }) {
    const { t } = useI18n();
    if (!card) return <Card title={t('My donor card')}><Loading /></Card>;
    const confirmed = Boolean(card.blood_type_confirmed_at);

    return (
        <Card title={t('My donor card')} actions={
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => downloadDonorCard(card)}>{t('Download card')}</button>
        }>
            <div className="donor-card">
                <div className="dc-top">
                    <span className="dc-brand"><span className="brand-drop" aria-hidden="true" /> {t('Blood donor card')}</span>
                    {card.badge && <span className={`medal medal-${card.badge.id}`}>{card.badge.label}</span>}
                </div>
                <div className="dc-name">{card.name}</div>
                <div className="dc-number">{card.donorNumber}</div>
                <div className="dc-facts">
                    <div>
                        <span>{t('Blood group')}</span>
                        <strong>{card.blood_type || '–'}</strong>
                        <em>{confirmed ? t('confirmed') : t('not yet confirmed')}</em>
                    </div>
                    <div><span>{t('Donations')}</span><strong>{card.donations}</strong></div>
                    <div><span>{t('Total given')}</span><strong>{card.total_volume_ml} mL</strong></div>
                    <div>
                        <span>{t('Can donate')}</span>
                        <strong>{card.eligible ? t('Today') : card.next_eligible_date ? formatDate(card.next_eligible_date) : t('Ask the blood bank')}</strong>
                    </div>
                </div>
            </div>

            <div className="medals" aria-label={t('Badges')}>
                {card.badges.map((b) => (
                    <div key={b.id} className={b.earned ? `medal-slot earned medal-${b.id}` : 'medal-slot'}
                        title={t('{count} donation(s)', { count: b.min })}>
                        <span className="medal-count">{b.min}</span>
                        <span className="medal-label">{b.label}</span>
                    </div>
                ))}
            </div>
            <p className="muted small">
                {card.next_badge
                    ? t('{count} more donation(s) to the {badge} badge.', { count: card.next_badge.remaining, badge: card.next_badge.label })
                    : t('You have earned every badge. Thank you for saving lives!')}
            </p>
        </Card>
    );
}
