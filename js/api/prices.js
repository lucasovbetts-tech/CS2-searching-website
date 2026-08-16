//separate caches per bulk endpoint - /api/prices and /api/item-prices query separate DB tables.
//Each holds the in-flight PROMISE rather than the resolved value: a page full of skin cards calls
//getPrices() once per card at the same time, and caching only the result means every one of those
//calls sees an empty cache and fires its own request for the whole price table.
let _cache = null;
let _itemCache = null;

function loadCache(url, label) {
    return fetch(url).then(res => {
        if (!res.ok) throw new Error(label);
        return res.json();
    });
}

function getPriceCache() {
    //a rejected promise would otherwise be cached forever and every later call would replay the failure
    if (!_cache) _cache = loadCache('/api/prices', 'Failed to load prices').catch(err => { _cache = null; throw err; });
    return _cache;
}

function getItemPriceCache() {
    if (!_itemCache) _itemCache = loadCache('/api/item-prices', 'Failed to load item prices').catch(err => { _itemCache = null; throw err; });
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
