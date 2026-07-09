// Calls our own backend (server/index.js), never the price providers directly —
// that's the whole point, the API keys only ever live on the server.
const BACKEND_URL = 'http://localhost:3001'; // TODO: point at your deployed backend once this goes live

const _cache = new Map();

export async function getPrices(defIndex, paintIndex) {
    const key = `${defIndex}:${paintIndex}`;
    if (_cache.has(key)) return _cache.get(key);

    const res = await fetch(`${BACKEND_URL}/api/price?defIndex=${defIndex}&paintIndex=${paintIndex}`);
    if (!res.ok) throw new Error('Failed to fetch prices');

    const data = await res.json();
    _cache.set(key, data);
    return data;
}
