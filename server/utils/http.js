/*
 * message is an English template such as 'Not enough {bloodType} in stock'.
 * details.vars fills the {placeholders}; the error handler translates the message
 * into the caller's language. Other details are returned to the client as they are.
 */
export class HttpError extends Error {
    constructor(status, message, details = {}) {
        super(message);
        const { vars, ...rest } = details;
        this.status = status;
        this.vars = vars;
        this.details = rest;
    }
}

// Express 4 does not catch rejected promises, so async routes are wrapped.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function parseId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
    return id;
}
