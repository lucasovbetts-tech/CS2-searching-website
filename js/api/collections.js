const COLLECTIONS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json';

let _cache = null;

export async function getCollections() {
    if (_cache) return _cache;
    const res = await fetch(COLLECTIONS_URL);
    if (!res.ok) throw new Error('Failed to load collections.json');
    _cache = await res.json();
    return _cache;
}
