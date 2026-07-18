// Calls our own backend (server/index.js), never CSMarketAPI directly —
// that's the whole point, the API key only ever lives on the server.
const BACKEND_URL = ''; // same-origin: server/index.js serves the frontend itself, so this never needs to change

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

const _weaponCache = new Map();

//low/high wear price range for every skin of one weapon at once - used on weapon pages (e.g. AK-47)
//instead of getPrices, since a full grid per card would be far more requests than a card needs
export async function getPricesForWeapon(weapon) {
    if (_weaponCache.has(weapon)) return _weaponCache.get(weapon);

    const res = await fetch(`${BACKEND_URL}/api/prices/weapon?weapon=${encodeURIComponent(weapon)}`);
    if (!res.ok) throw new Error('Failed to fetch weapon prices');

    const data = await res.json();
    _weaponCache.set(weapon, data);
    return data;
}