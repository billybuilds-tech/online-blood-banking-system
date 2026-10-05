import { useI18n } from '../i18n.jsx';

// value picks the colour; the text is the translated value unless children are given.
export function Badge({ value, children }) {
    const { t } = useI18n();
    const text = children ?? t(String(value));
    return <span className={`badge badge-${String(value).toLowerCase().replace(/[^a-z]/g, '')}`}>{text}</span>;
}

export function Alert({ message, onClose }) {
    const { t } = useI18n();
    if (!message) return null;
    return (
        <div className={`alert alert-${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
            <div>
                {message.text}
                {message.data?.nextEligibleDate && (
                    <div>{t('Next eligible date:')} <strong>{message.data.nextEligibleDate}</strong></div>
                )}
                {message.data?.failedQuestions?.length > 0 && (
                    <ul className="alert-list">
                        {message.data.failedQuestions.map((q) => <li key={q.id}>{q.advice}</li>)}
                    </ul>
                )}
                {message.data?.alternatives && (
                    <div>
                        {message.data.alternatives.length
                            ? t('Compatible groups in your stock: {list}', {
                                list: message.data.alternatives.map((a) => `${a.blood_type} (${a.units})`).join(', '),
                            })
                            : t('No compatible blood group is in your stock. Consider an inter-bank request.')}
                    </div>
                )}
            </div>
            {onClose && <button type="button" className="alert-close" onClick={onClose} aria-label={t('Close')}>×</button>}
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
    const { t } = useI18n();
    return <p className="empty">{t('Loading…')}</p>;
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
