let _cache = null;

async function getPriceCache() {
    if (_cache) return _cache;
    const res = await fetch('data/price-cache.json');
    if (!res.ok) throw new Error('Failed to load price-cache.json');
    _cache = await res.json();
    return _cache;
}

export async function getPrices(defIndex, paintIndex) {
    const cache = await getPriceCache();
    const entry = cache[`${defIndex}:${paintIndex}`];
    return entry ? entry.data : null;
}

//for non-skin items (stickers, agents, charms, patches, music kits, graffiti, pins) - no wear tiers or
//variants, just a flat {provider: price} map, cached under the item's own id rather than defIndex:paintIndex
export async function getItemPrice(id) {
    const cache = await getPriceCache();
    const entry = cache[id];
    return entry ? entry.data : null;
}
