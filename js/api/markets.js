let _cache = null;

//keyed by lowercase provider key (e.g. "csfloat") to match price objects' keys directly,
//not by the display name ("CSFloat") cs2capmarkets.json itself is keyed by
export async function getMarkets() {
    if (_cache) return _cache;
    const res = await fetch('data/cs2capmarkets.json');
    if (!res.ok) throw new Error('Failed to load cs2capmarkets.json');
    const raw = await res.json();
    _cache = Object.fromEntries(Object.values(raw).map(m => [m.key, m]));
    return _cache;
}
