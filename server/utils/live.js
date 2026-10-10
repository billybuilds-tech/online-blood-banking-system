import serialize from 'serialize-javascript';

/*
 * Real-time delivery with Server-Sent Events (Recommendation 4).
 * Each logged-in browser keeps one open /api/notifications/stream response; this module
 * remembers them per user and writes an event when something new happens.
 * Connections live in this process's memory, so the API runs as a single instance.
 */
const clients = new Map(); // userId -> Set of open responses


export function subscribe(userId, res) {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(res);
    return () => {
        const set = clients.get(userId);
        if (!set) return;
        set.delete(res);
        if (!set.size) clients.delete(userId);
    };
}

export function publish(userId, event, data) {
    const set = clients.get(userId);
    if (!set) return;
    const payload = eventFrame(event, data);
    for (const res of set) res.write(Buffer.from(payload, 'utf8'));
}

export function eventFrame(event, data) {
    if (typeof event !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(event)) throw new Error('Invalid event name');
    const json = serialize(data, { isJSON: true, unsafe: false }).replaceAll('&', '\\u0026');
    return `event: ${event}\ndata: ${json}\n\n`;
}

// Closes a user's streams, e.g. when the manager suspends or deletes the account.
export function disconnect(userId) {
    const set = clients.get(userId);
    if (!set) return;
    for (const res of set) res.end();
    clients.delete(userId);
}

export function connectedUsers() {
    return clients.size;
}
