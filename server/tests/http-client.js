export function apiClient(getBase, { browser = false } = {}) {
    const cookies = new Map();
    let csrf, csrfPromise;
    const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const save = (headers) => {
        for (const header of headers.getSetCookie()) {
            const pair = header.split(';')[0], separator = pair.indexOf('=');
            const name = pair.slice(0, separator);
            if (browser || name === 'obbs_csrf' || name === '__Host-obbs_csrf') cookies.set(name, pair.slice(separator + 1));
        }
    };
    return async (method, path, { token, body, lang, headers = {} } = {}) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !csrf) {
            csrfPromise ||= fetch(getBase() + '/csrf-token', { headers: { Cookie: cookieHeader() } }).then(async (response) => {
                save(response.headers);
                return (await response.json()).token;
            });
            csrf = await csrfPromise;
        }
        const response = await fetch(getBase() + path, {
            method, headers: {
                'Content-Type': 'application/json', Cookie: cookieHeader(),
                ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(lang ? { 'Accept-Language': lang } : {}), ...headers,
            }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        save(response.headers);
        const data = await response.json().catch(() => null);
        return { status: response.status, data, headers: response.headers };
    };
}
