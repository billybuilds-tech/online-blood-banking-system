import { formatDateTime } from '../constants.js';
import { useI18n } from '../i18n.jsx';

/*
 * Where an approved request is: approved -> being prepared -> ready for collection or on the way
 * (with the courier) -> received. Each step shows when it happened.
 */
export function DeliveryTracker({ request: r }) {
    const { t } = useI18n();
    let middle;
    if (r.dispatched_at) {
        middle = {
            label: t('On the way'), at: r.dispatched_at,
            detail: <>{t('With {courier}', { courier: r.courier_name })} · <a href={`tel:${r.courier_phone}`}>{r.courier_phone}</a></>,
        };
    } else if (r.ready_at) {
        middle = { label: t('Ready for collection'), at: r.ready_at, detail: r.bank_name };
    } else {
        middle = { label: t('Being prepared'), at: null };
    }
    const received = r.delivery_status === 'received';
    const steps = [
        { key: 'approved', label: t('Request approved'), at: r.decided_at, done: true },
        { key: 'middle', ...middle, done: r.delivery_status !== 'preparing' },
        {
            key: 'received', label: t('Blood received'), at: r.received_at, done: received,
            detail: received && r.received_confirmed_by ? t(r.received_confirmed_by === 'recipient' ? 'Confirmed by the requester' : 'Recorded by the blood bank') : null,
        },
    ];
    const current = steps.findIndex((s) => !s.done);

    return (
        <ol className="delivery" aria-label={t('Delivery progress')}>
            {steps.map((s, i) => (
                <li key={s.key} className={s.done ? 'done' : i === current ? 'current' : ''}>
                    <span className="delivery-dot" aria-hidden="true" />
                    <span className="delivery-label">{s.label}</span>
                    {s.at && <span className="delivery-time">{formatDateTime(s.at)}</span>}
                    {s.detail && <span className="delivery-detail">{s.detail}</span>}
                </li>
            ))}
        </ol>
    );
}

// Short status for tables.
export function deliveryLabel(status, t) {
    return {
        preparing: t('Being prepared'),
        ready: t('Ready for collection'),
        dispatched: t('On the way'),
        received: t('Blood received'),
    }[status] ?? '';
}
