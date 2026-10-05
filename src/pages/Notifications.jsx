import { useState } from 'react';
import { NotificationList } from '../components/NotificationBell.jsx';
import { Card } from '../components/ui.jsx';
import { useI18n } from '../i18n.jsx';
import { useNotifications } from '../notifications.jsx';

// Every notification the user has received, opened from the side menu.
export default function Notifications() {
    const { t } = useI18n();
    const { items, unread, markRead, markAll } = useNotifications();
    const [onlyUnread, setOnlyUnread] = useState(false);
    const shown = onlyUnread ? items.filter((n) => !n.is_read) : items;

    return (
        <div className="page">
            <Card title={t('Notifications')} actions={<>
                <label className="check small">
                    <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
                    {t('Unread only ({count})', { count: unread })}
                </label>
                {unread > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={markAll}>{t('Mark all read')}</button>}
            </>}>
                <div className="note-page">
                    <NotificationList items={shown} onRead={markRead} />
                </div>
            </Card>
        </div>
    );
}
