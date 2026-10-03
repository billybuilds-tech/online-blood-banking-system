import { useState } from 'react';
import { api } from '../../api.js';
import { Alert, Badge, Empty, Loading, TableWrap } from '../../components/ui.jsx';
import { ROLE_LABELS, formatDateTime } from '../../constants.js';
import { useApi } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';

// Must match AUDIT_CATEGORIES in server/utils/audit.js.
const CATEGORY_LABELS = {
    accounts: 'Accounts and logins',
    donations: 'Donations',
    requests: 'Requests and transfers',
    stock: 'Stock',
    messages: 'Appeals and messages',
    system: 'System',
};

const WARNING_ACTIONS = ['auth.login_failed', 'auth.login_blocked', 'user.deleted', 'stock.discarded', 'stock.expired'];

// Who did what, to whom and when: newest first, 50 entries at a time.
export default function AuditLog() {
    const { t } = useI18n();
    const [filters, setFilters] = useState({ category: '', from: '', to: '', search: '' });
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const first = useApi(`/audit${query ? `?${query}` : ''}`);
    // Older pages belong to the first page they were loaded after; a new filter or a reload drops them.
    const [more, setMore] = useState({ base: null, entries: [], next: null });
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');

    const older = more.base === first.data ? more : { entries: [], next: first.data?.next ?? null };
    const entries = [...(first.data?.entries ?? []), ...older.entries];
    const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

    async function loadMore() {
        setLoadingMore(true);
        try {
            const page = await api(`/audit?${query ? `${query}&` : ''}before=${older.next}`);
            setMore({ base: first.data, entries: [...older.entries, ...page.entries], next: page.next });
            setError('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingMore(false);
        }
    }

    return (
        <>
            <div className="filters audit-filters">
                <select value={filters.category} onChange={set('category')} aria-label={t('Type')}>
                    <option value="">{t('All actions')}</option>
                    {Object.entries(CATEGORY_LABELS).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
                </select>
                <label className="small muted">{t('From')} <input type="date" value={filters.from} onChange={set('from')} /></label>
                <label className="small muted">{t('To')} <input type="date" value={filters.to} onChange={set('to')} /></label>
                <input className="search" type="search" placeholder={t('Search names, emails, bag numbers')} value={filters.search} onChange={set('search')} />
                <button type="button" className="btn btn-sm btn-ghost" onClick={first.reload}>{t('Refresh')}</button>
            </div>
            <p className="muted small">
                {t('Every important action is recorded with who did it, to whom, when and from which address. Entries cannot be changed.')}
            </p>
            <Alert message={first.error || error ? { type: 'error', text: first.error || error } : null} />
            {first.loading && !first.data && <Loading />}
            {first.data && !entries.length && <Empty>{t('No entries match these filters.')}</Empty>}
            {entries.length > 0 && (
                <TableWrap>
                    <thead><tr><th>{t('When')}</th><th>{t('Who')}</th><th>{t('Action')}</th><th>{t('Type')}</th><th>{t('Address')}</th></tr></thead>
                    <tbody>
                        {entries.map((e) => (
                            <tr key={e.id} className={WARNING_ACTIONS.includes(e.action) ? 'row-urgent' : ''}>
                                <td className="nowrap">{formatDateTime(e.created_at)}</td>
                                <td>
                                    {e.actor_name ?? (e.action === 'auth.login_failed' ? t('Unknown visitor') : t('System'))}
                                    {e.actor_role && <div className="muted small">{t(ROLE_LABELS[e.actor_role] ?? e.actor_role)}</div>}
                                </td>
                                <td>{e.summary}</td>
                                <td>{e.category && <Badge value={e.category}>{t(CATEGORY_LABELS[e.category])}</Badge>}</td>
                                <td className="muted small">{e.ip_address?.replace(/^::ffff:/, '') || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
            {older.next && (
                <button type="button" className="btn btn-sm btn-ghost" disabled={loadingMore} onClick={loadMore}>
                    {loadingMore ? t('Loading…') : t('Show older entries')}
                </button>
            )}
        </>
    );
}
