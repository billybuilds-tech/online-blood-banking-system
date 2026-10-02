import { BLOOD_TYPES, LOW_STOCK } from '../constants.js';

// Eight tiles, one per blood group. rows: [{ blood_type, units }]
export default function StockGrid({ rows, highlight = [] }) {
    const byType = Object.fromEntries((rows || []).map((r) => [r.blood_type, r.units]));
    return (
        <div className="stock-grid">
            {BLOOD_TYPES.map((type) => {
                const units = byType[type] ?? 0;
                const tone = units === 0 ? 'empty' : units < LOW_STOCK ? 'low' : 'ok';
                return (
                    <div key={type} className={`stock-tile stock-${tone} ${highlight.includes(type) ? 'stock-match' : ''}`}>
                        <div className="stock-type">{type}</div>
                        <div className="stock-units">{units}</div>
                        <div className="stock-label">{tone === 'empty' ? 'None' : tone === 'low' ? 'Low' : 'units'}</div>
                    </div>
                );
            })}
        </div>
    );
}
