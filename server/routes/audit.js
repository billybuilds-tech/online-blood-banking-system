import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../utils/audit.js';
import { HttpError, ah, parseId } from '../utils/http.js';
import { addDays, parseDate } from '../utils/rules.js';
import { cleanText } from '../utils/validate.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

const PAGE_SIZE = 50;

function parseJson(value) {
    if (typeof value !== 'string') return value ?? null;
    try { return JSON.parse(value); } catch { return null; }
}

const categoryOf = (action) => Object.keys(AUDIT_CATEGORIES).find((c) => AUDIT_CATEGORIES[c].some((p) => action.startsWith(p)));

/*
 * The audit log for the Blood Bank Manager, newest first, PAGE_SIZE rows at a time.
 * Filters: category, from/to (dates), search (names and details), userId (actor or subject).
 * The next page is requested with before=<the next value of the previous page>.
 */
router.get('/', ah(async (req, res) => {
    const where = [];
    const params = [];
    const { category, from, to } = req.query;
    if (category) {
        if (typeof category !== 'string' || !Object.hasOwn(AUDIT_CATEGORIES, category))
            throw new HttpError(400, 'Invalid category');
        const prefixes = AUDIT_CATEGORIES[category];
        if (!prefixes) throw new HttpError(400, 'Invalid category');
        where.push(`(${prefixes.map(() => 'a.action LIKE ?').join(' OR ')})`);
        params.push(...prefixes.map((p) => `${p}%`));
    }
    if (from) {
        if (!parseDate(from)) throw new HttpError(400, 'Invalid date');
        where.push('a.created_at >= ?');
        params.push(from);
    }
    if (to) {
        if (!parseDate(to)) throw new HttpError(400, 'Invalid date');
        where.push('a.created_at < ?');
        params.push(addDays(to, 1));
    }
    const { search: searchValue } = req.query;
    const search = cleanText(searchValue, 100);
    if (search) {
        where.push('(a.actor_name LIKE ? OR a.subject_name LIKE ? OR CAST(a.details AS CHAR) LIKE ?)');
        params.push(...Array(3).fill(`%${search}%`));
    }
    if (req.query.userId) {
        const userId = parseId(req.query.userId);
        where.push('(a.actor_id = ? OR a.subject_id = ?)');
        params.push(userId, userId);
    }
    if (req.query.before) {
        where.push('a.id < ?');
        params.push(parseId(req.query.before));
    }

    const rows = await query(
        `SELECT a.* FROM audit_log a ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT ?`,
        [...params, PAGE_SIZE + 1]);
    const page = rows.slice(0, PAGE_SIZE);
    res.json({
        entries: page.map(({ details, ...r }) => ({
            ...r,
            category: categoryOf(r.action) ?? null,
            summary: req.t(AUDIT_ACTIONS[r.action] ?? r.action, parseJson(details) ?? {}),
        })),
        next: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
    });
}));

export default router;
