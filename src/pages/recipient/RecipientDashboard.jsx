import { useAuth } from '../../auth.jsx';
import { FindBlood, MyRequests, RequestBlood } from '../../components/BloodRequests.jsx';
import { Stat } from '../../components/ui.jsx';
import { useApi, useLiveRefresh } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';
import { useSection, useSectionCounts } from '../../nav.jsx';

export default function RecipientDashboard() {
    const { user } = useAuth();
    const { t } = useI18n();
    const [tab, goTo] = useSection();
    const requests = useApi('/blood-requests');
    useLiveRefresh(requests.reload);
    const pending = requests.data?.filter((r) => r.status === 'pending').length ?? 0;
    useSectionCounts({ requests: pending });

    return (
        <div className="page">
            <div className="page-head">
                <h1>{t('Welcome, {name}', { name: user.name.split(' ')[0] })}</h1>
                <p className="muted">{t('Recipient')} · {t('Blood group')} <strong>{user.blood_type || t('not set')}</strong></p>
            </div>

            <div className="stats">
                <Stat label={t('Requests sent')} value={requests.data?.length ?? '–'} />
                <Stat label={t('Pending')} value={pending} tone={pending ? 'warn' : undefined} />
                <Stat label={t('Approved')} value={requests.data?.filter((r) => r.status === 'approved').length ?? '–'} tone="good" />
                <Stat label={t('Units received')} value={requests.data?.filter((r) => r.status === 'approved').reduce((s, r) => s + r.units, 0) ?? '–'} />
            </div>


            {tab === 'find' && <FindBlood bloodType={user.blood_type} />}
            {tab === 'request' && <RequestBlood defaultType={user.blood_type} onSent={() => { requests.reload(); goTo('requests'); }} />}
            {tab === 'requests' && <MyRequests state={requests} />}
        </div>
    );
}
