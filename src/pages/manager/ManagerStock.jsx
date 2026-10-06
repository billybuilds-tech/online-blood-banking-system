import { useMemo, useState } from 'react';
import StockGrid from '../../components/StockGrid.jsx';
import { Badge, Card, Empty, Loading, TableWrap } from '../../components/ui.jsx';
import { BLOOD_TYPES, LOW_STOCK, formatDate } from '../../constants.js';
import { useApi, useLiveRefresh } from '../../hooks.js';
import { useI18n } from '../../i18n.jsx';

/*
 * Stock of every approved blood bank. Stock levels are confidential: each bank sees only its own,
 * and only the Blood Bank Manager sees every bank. Choosing a bank shows its usable bags.
 */
export default function ManagerStock() {
    const { t } = useI18n();
    const stock = useApi('/stock');
    useLiveRefresh(stock.reload);
    const [bankId, setBankId] = useState(null);
    const [search, setSearch] = useState('');

    const banks = useMemo(() => {
        const map = new Map();
        for (const row of stock.data || []) {
            if (!map.has(row.blood_bank_id)) {
                map.set(row.blood_bank_id, { id: row.blood_bank_id, name: row.bank_name, region: row.region, rows: [], units: {}, total: 0, expiring: 0 });
            }
            const bank = map.get(row.blood_bank_id);
            bank.rows.push(row);
            bank.units[row.blood_type] = row.units;
            bank.total += row.units;
            bank.expiring += row.expiring;
        }
        return [...map.values()];
    }, [stock.data]);
    const term = search.trim().toLowerCase();
    const shown = banks.filter((b) => !term || `${b.name} ${b.region ?? ''}`.toLowerCase().includes(term));
    const totals = Object.fromEntries(BLOOD_TYPES.map((type) => [type, banks.reduce((sum, b) => sum + (b.units[type] ?? 0), 0)]));
    const selected = banks.find((b) => b.id === bankId);

    // Empty groups are grey and groups below the alert level red.
    const cellClass = (units) => (!units ? 'stock-cell stock-cell-empty' : units < LOW_STOCK ? 'stock-cell stock-cell-low' : 'stock-cell');

    return (
        <>
            <Card title={t('Blood stock in every bank')} actions={
                <input className="search" type="search" placeholder={t('Search by name or region')} value={search} onChange={(e) => setSearch(e.target.value)} />
            }>
                <p className="muted small">
                    {t('Stock levels are confidential: each blood bank sees only its own stock, and only the Blood Bank Manager sees every bank. Donors and recipients do not see stock.')}
                    {' '}{t('Below {count} units is shown in red.', { count: LOW_STOCK })}
                </p>
                {stock.loading && !stock.data && <Loading />}
                {stock.data && !shown.length && <Empty>{t('No blood banks found.')}</Empty>}
                {shown.length > 0 && (
                    <TableWrap>
                        <thead>
                            <tr>
                                <th>{t('Blood bank')}</th>
                                {BLOOD_TYPES.map((type) => <th key={type} className="stock-cell">{type}</th>)}
                                <th className="stock-cell">{t('Total')}</th>
                                <th className="stock-cell">{t('Expiring soon')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((b) => (
                                <tr key={b.id} className={b.id === bankId ? 'row-open' : ''}>
                                    <td>
                                        <button type="button" className="link" onClick={() => setBankId(b.id === bankId ? null : b.id)}>{b.name}</button>
                                        <div className="muted small">{b.region}</div>
                                    </td>
                                    {BLOOD_TYPES.map((type) => <td key={type} className={cellClass(b.units[type])}>{b.units[type] ?? 0}</td>)}
                                    <td className="stock-cell"><strong>{b.total}</strong></td>
                                    <td className="stock-cell">{b.expiring > 0 ? <Badge value="expiring">{b.expiring}</Badge> : <span className="muted">0</span>}</td>
                                </tr>
                            ))}
                            <tr className="stock-total-row">
                                <td><strong>{t('All banks')}</strong></td>
                                {BLOOD_TYPES.map((type) => <td key={type} className="stock-cell"><strong>{totals[type]}</strong></td>)}
                                <td className="stock-cell"><strong>{Object.values(totals).reduce((a, b) => a + b, 0)}</strong></td>
                                <td className="stock-cell" />
                            </tr>
                        </tbody>
                    </TableWrap>
                )}
            </Card>
            {selected && <BankBags bank={selected} />}
        </>
    );
}

// Usable bags of one bank, the ones that expire first at the top (read only).
function BankBags({ bank }) {
    const { t } = useI18n();
    const bags = useApi(`/stock/units?bankId=${bank.id}&status=available`);
    const [showAll, setShowAll] = useState(false);
    const rows = bags.data || [];
    const shown = showAll ? rows : rows.slice(0, 25);
    return (
        <Card title={t('Stock at {bank}', { bank: bank.name })}>
            <StockGrid rows={bank.rows} />
            {bags.loading && !bags.data && <Loading />}
            {bags.data && !rows.length && <Empty>{t('No bags to show.')}</Empty>}
            {rows.length > 0 && (
                <TableWrap>
                    <thead><tr><th>{t('Bag number')}</th><th>{t('Group')}</th><th>{t('Collected')}</th><th>{t('Expires')}</th></tr></thead>
                    <tbody>
                        {shown.map((bag) => (
                            <tr key={bag.id} className={bag.state !== 'ok' ? 'row-urgent' : ''}>
                                <td><strong>{bag.unit_number}</strong></td>
                                <td>{bag.blood_type}</td>
                                <td>{formatDate(bag.collected_on)}</td>
                                <td>
                                    {formatDate(bag.expiry_date)}
                                    {bag.state === 'expiring' && <div><Badge value="expiring">{bag.daysLeft === 0 ? t('Expires today') : t('{days} day(s) left', { days: bag.daysLeft })}</Badge></div>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
            {rows.length > shown.length && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowAll(true)}>{t('Show all {count} bags', { count: rows.length })}</button>
            )}
        </Card>
    );
}
