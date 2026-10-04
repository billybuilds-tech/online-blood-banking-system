// Small SVG charts drawn without a library, so they follow the page's fonts, colours and language.

// Rounds the top of the scale up to 1, 2 or 5 times a power of ten, split into four steps.
// Also used by the charts in the PDF report (utils/report.js).
export function niceScale(maxValue) {
    const rough = Math.max(1, maxValue) / 4;
    const power = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough);
    return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

/*
 * Vertical bars: one group per row of data, one bar per series, side by side or stacked.
 * data: [{ label, [series.key]: number }]; series: [{ key, label, color }].
 */
export function BarChart({ data, series, stacked = false, height = 230, title }) {
    const width = 560;
    const pad = { top: 10, right: 6, bottom: 30, left: 38 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const value = (row, key) => Number(row[key]) || 0;
    const highest = Math.max(0, ...data.map((row) => (stacked
        ? series.reduce((sum, s) => sum + value(row, s.key), 0)
        : Math.max(0, ...series.map((s) => value(row, s.key))))));
    const { max, ticks } = niceScale(highest);
    const band = innerW / data.length;
    const barWidth = stacked ? band * 0.62 : (band * 0.8) / series.length;
    const y = (v) => pad.top + innerH - (v / max) * innerH;
    const labelEvery = Math.ceil(data.length / 8);

    return (
        <figure className="chart">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
                {ticks.map((tick) => (
                    <g key={tick}>
                        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
                        <text x={pad.left - 6} y={y(tick) + 4} textAnchor="end" className="chart-axis">{tick}</text>
                    </g>
                ))}
                {data.map((row, i) => {
                    const x0 = pad.left + i * band;
                    let stackTop = 0;
                    return (
                        <g key={row.label}>
                            {series.map((s, j) => {
                                const v = value(row, s.key);
                                if (!v) return null;
                                const x = stacked ? x0 + (band - barWidth) / 2 : x0 + band * 0.1 + j * barWidth;
                                const top = stacked ? stackTop + v : v;
                                const bottom = stacked ? stackTop : 0;
                                if (stacked) stackTop += v;
                                return (
                                    <rect key={s.key} x={x} width={Math.max(1, barWidth - 1)} y={y(top)} height={y(bottom) - y(top)} fill={s.color} rx={2}>
                                        <title>{`${row.label} · ${s.label}: ${v}`}</title>
                                    </rect>
                                );
                            })}
                            {i % labelEvery === 0 && (
                                <text x={x0 + band / 2} y={height - 8} textAnchor="middle" className="chart-axis">{row.label}</text>
                            )}
                        </g>
                    );
                })}
                <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="chart-base" />
            </svg>
            <figcaption className="chart-legend">
                {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
            </figcaption>
        </figure>
    );
}

// Horizontal bars with the value written beside each one. rows: [{ label, value, text, tone }].
export function HorizontalBars({ rows, max }) {
    const top = max ?? Math.max(1, ...rows.map((r) => r.value || 0));
    return (
        <div className="hbars">
            {rows.map((r) => (
                <div key={r.label} className="hbar-row">
                    <span className="hbar-label">{r.label}</span>
                    <span className="hbar-track">
                        <span className={`hbar-fill hbar-${r.tone || 'ok'}`} style={{ width: `${Math.min(100, ((r.value || 0) / top) * 100)}%` }} />
                    </span>
                    <span className="hbar-value">{r.text}</span>
                </div>
            ))}
        </div>
    );
}
