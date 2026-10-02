import { useMemo, useState } from 'react';
import { useApi, useLiveRefresh } from '../hooks.js';
import { useI18n } from '../i18n.jsx';
import StockGrid from './StockGrid.jsx';
import { Card, Empty, Loading } from './ui.jsx';

// Every approved blood bank with its stock; highlight marks groups the viewer can receive.
export default function BanksStock({ highlight = [] }) {
    const { t } = useI18n();
    const stock = useApi('/stock');
    const [search, setSearch] = useState('');
    useLiveRefresh(stock.reload);

    const banks = useMemo(() => {
        const map = new Map();
        for (const row of stock.data || []) {
            if (!map.has(row.blood_bank_id)) {
                map.set(row.blood_bank_id, { id: row.blood_bank_id, name: row.bank_name, region: row.region, phone: row.phone, address: row.address, rows: [] });
            }
            map.get(row.blood_bank_id).rows.push(row);
        }
        const term = search.trim().toLowerCase();
        return [...map.values()].filter((b) => !term || `${b.name} ${b.region}`.toLowerCase().includes(term));
    }, [stock.data, search]);

    return (
        <Card title={t('Blood banks and current stock')} actions={
            <input className="search" type="search" placeholder={t('Search by name or region')} value={search} onChange={(e) => setSearch(e.target.value)} />
        }>
            {stock.loading && !stock.data && <Loading />}
            {stock.data && !banks.length && <Empty>{t('No blood banks found.')}</Empty>}
            <div className="bank-list">
                {banks.map((b) => (
                    <article key={b.id} className="bank-card">
                        <header>
                            <h3>{b.name}</h3>
                            <p className="muted small">{[b.region, b.address, b.phone].filter(Boolean).join(' · ')}</p>
                        </header>
                        <StockGrid rows={b.rows} highlight={highlight} />
                    </article>
                ))}
            </div>
        </Card>
    );
}
