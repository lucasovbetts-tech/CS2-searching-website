//credentials: 'include' on every call - the session lives in an httpOnly cookie, and fetch
//won't send cookies by default, so without this the server sees every request as logged out
let _me = null;

export async function getMe() {
    if (!_me) {
        _me = fetch('/api/me', { credentials: 'include' })
            .then(res => (res.ok ? res.json() : null))
            .catch(() => null); //signed-out is the sane fallback if the endpoint is unreachable
    }
    return _me;
}

export function loginUrl() {
    return '/auth/steam';
}

export async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    _me = null;
    window.location.reload();
}
