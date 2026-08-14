//separate caches per bulk endpoint - /api/prices and /api/item-prices query separate DB tables
let _cache = null;
let _itemCache = null;

async function getPriceCache() {
    if (_cache) return _cache;
    const res = await fetch('/api/prices');
    if (!res.ok) throw new Error('Failed to load prices');
    _cache = await res.json();
    return _cache;
}

async function getItemPriceCache() {
    if (_itemCache) return _itemCache;
    const res = await fetch('/api/item-prices');
    if (!res.ok) throw new Error('Failed to load item prices');
    _itemCache = await res.json();
    return _itemCache;
}

export async function getPrices(defIndex, paintIndex) {
    const cache = await getPriceCache();
    const entry = cache[`${defIndex}:${paintIndex}`];
    return entry ? entry.data : null;
}

//for non-skin items (stickers, agents, charms, patches, music kits, graffiti, pins) - no wear tiers or
//variants, just a flat {provider: {price, link}} map, cached under the item's own id
export async function getItemPrice(id) {
    const cache = await getItemPriceCache();
    const entry = cache[id];
    return entry ? entry.data : null;
}
