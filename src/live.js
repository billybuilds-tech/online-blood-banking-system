import { BASE, getToken } from './api.js';

/*
 * Opens the Server-Sent Events stream with fetch (so the token travels in the
 * Authorization header, not the URL) and calls onEvent for every "notification" event.
 * Reconnects with increasing delay if the connection drops. Returns a stop function.
 */
export function startLiveStream({ onEvent, onStatus }) {
    let controller = null;
    let stopped = false;
    let retryDelay = 2000;
    let retryTimer = null;

    async function connect() {
        if (stopped) return;
        controller = new AbortController();
        try {
            const res = await fetch(`${BASE}/notifications/stream`, {
                headers: { Authorization: `Bearer ${getToken()}`, Accept: 'text/event-stream' },
                signal: controller.signal,
            });
            if (res.status === 401) {
                window.dispatchEvent(new Event('obbs:logout'));
                return;
            }
            if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`);

            onStatus(true);
            retryDelay = 2000;
            const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
            let buffer = '';
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += value.replaceAll('\r\n', '\n');
                let end;
                while ((end = buffer.indexOf('\n\n')) >= 0) {
                    const block = buffer.slice(0, end);
                    buffer = buffer.slice(end + 2);
                    const event = parseEvent(block);
                    if (event?.type === 'notification') onEvent(event.data);
                }
            }
        } catch {
            if (stopped) return;
        }
        onStatus(false);
        if (!stopped) {
            retryTimer = setTimeout(connect, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30_000);
        }
    }

    connect();
    return () => {
        stopped = true;
        clearTimeout(retryTimer);
        controller?.abort();
    };
}

function parseEvent(block) {
    let type = 'message';
    const data = [];
    for (const line of block.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (!data.length) return null; // comments and heartbeats
    try {
        return { type, data: JSON.parse(data.join('\n')) };
    } catch {
        return null;
    }
}
