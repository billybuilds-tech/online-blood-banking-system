export function Badge({ value, children }) {
    const text = children ?? value;
    return <span className={`badge badge-${String(value).toLowerCase().replace(/[^a-z]/g, '')}`}>{text}</span>;
}

export function Alert({ message, onClose }) {
    if (!message) return null;
    return (
        <div className={`alert alert-${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
            <div>
                {message.text}
                {message.data?.nextEligibleDate && <div>Next eligible date: <strong>{message.data.nextEligibleDate}</strong></div>}
                {message.data?.alternatives && (
                    <div>
                        {message.data.alternatives.length
                            ? <>Compatible groups in your stock: {message.data.alternatives.map((a) => `${a.blood_type} (${a.units})`).join(', ')}</>
                            : 'No compatible blood group is in your stock. Consider an inter-bank request.'}
                    </div>
                )}
            </div>
            {onClose && <button type="button" className="alert-close" onClick={onClose} aria-label="Close">×</button>}
        </div>
    );
}

export function Tabs({ tabs, active, onChange }) {
    return (
        <div className="tabs" role="tablist">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active === tab.id}
                    className={active === tab.id ? 'tab active' : 'tab'}
                    onClick={() => onChange(tab.id)}
                >
                    {tab.label}
                    {tab.count ? <span className="tab-count">{tab.count}</span> : null}
                </button>
            ))}
        </div>
    );
}

export function Stat({ label, value, hint, tone }) {
    return (
        <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            {hint && <div className="stat-hint">{hint}</div>}
        </div>
    );
}

export function Card({ title, actions, children }) {
    return (
        <section className="card">
            {(title || actions) && (
                <header className="card-header">
                    {title && <h2>{title}</h2>}
                    {actions && <div className="card-actions">{actions}</div>}
                </header>
            )}
            {children}
        </section>
    );
}

export function Empty({ children }) {
    return <p className="empty">{children}</p>;
}

export function Loading() {
    return <p className="empty">Loading…</p>;
}

export function Field({ label, children, hint }) {
    return (
        <label className="field">
            <span className="field-label">{label}</span>
            {children}
            {hint && <span className="field-hint">{hint}</span>}
        </label>
    );
}

export function TableWrap({ children }) {
    return <div className="table-wrap"><table>{children}</table></div>;
}
