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
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) res.write(payload);
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
