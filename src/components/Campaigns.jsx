import { getLocale } from '../lang.js';
import { useI18n } from '../i18n.jsx';
import { Badge } from './ui.jsx';

// Campaign states from the server: upcoming, today, finished, cancelled.
export const CAMPAIGN_STATE_LABELS = {
    upcoming: 'Upcoming',
    today: 'Today',
    finished: 'Finished',
    cancelled: 'Cancelled',
};

// Day and short month in a block, like a calendar page.
export function CampaignDate({ date }) {
    const d = new Date(`${date}T00:00:00`);
    return (
        <div className="campaign-date" aria-hidden="true">
            <b>{d.getDate()}</b>
            <span>{d.toLocaleDateString(getLocale(), { month: 'short' })}</span>
        </div>
    );
}

// One campaign: date, title, place and time; `aside` holds buttons or progress.
export function CampaignItem({ campaign: c, aside, children }) {
    const { t } = useI18n();
    const longDate = new Date(`${c.campaign_date}T00:00:00`).toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return (
        <article className="campaign-card">
            <CampaignDate date={c.campaign_date} />
            <div className="campaign-body">
                <h3>
                    {c.title}
                    {c.state && c.state !== 'upcoming' && <Badge value={c.state}>{t(CAMPAIGN_STATE_LABELS[c.state])}</Badge>}
                </h3>
                <p className="muted small">{longDate} · {c.start_time}–{c.end_time}</p>
                <p className="small">{c.venue} · {c.region}{c.bank_name ? ` · ${c.bank_name}` : ''}</p>
                {c.description && <p className="muted small">{c.description}</p>}
                {children}
            </div>
            {aside && <div className="campaign-aside">{aside}</div>}
        </article>
    );
}

// Donated units against the target.
export function CampaignProgress({ campaign: c }) {
    const { t } = useI18n();
    const percent = Math.min(100, Math.round((c.donated / c.target_units) * 100));
    return (
        <div className="campaign-progress">
            <div className="campaign-bar" role="progressbar" aria-valuemin={0} aria-valuemax={c.target_units} aria-valuenow={c.donated}>
                <span style={{ width: `${percent}%` }} />
            </div>
            <span className="small">
                {t('{donated} of {target} units collected', { donated: c.donated, target: c.target_units })}
                {' · '}{t('{count} registered', { count: c.registered })}
                {c.deferred > 0 && <> · {t('{count} deferred', { count: c.deferred })}</>}
            </span>
        </div>
    );
}
