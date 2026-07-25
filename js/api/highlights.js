let _cache = null;

export async function getHighlights() {
    if (_cache) return _cache;
    const res = await fetch('data/highlights.json');
    if (!res.ok) throw new Error('Failed to load highlights.json');
    _cache = await res.json();
    return _cache;
}
