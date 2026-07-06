let _cache = null;

export async function getWeapons() {
    if (_cache) return _cache;
    const res = await fetch('data/weapons.json');
    if (!res.ok) throw new Error('Failed to load weapons.json');
    _cache = await res.json();
    return _cache;
}
