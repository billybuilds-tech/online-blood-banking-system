export class HttpError extends Error {
    constructor(status, message, details = {}) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

// Express 4 does not catch rejected promises, so async routes are wrapped.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parseId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
    return id;
}
