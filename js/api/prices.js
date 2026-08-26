//Two levels of price data, because the pages need different things:
//
//  getPrices()/getItemPrice()   - the CHEAPEST price only, from one bulk request that every page
//                                 shares. This is what the grids use, and it's ~98% smaller than
//                                 shipping every market's price and link to everyone.
//  getSkinMarkets()/getItemMarkets() - the full per-market breakdown for ONE item, fetched only
//                                 when a detail page actually opens.
//
//The bulk caches hold the in-flight promise rather than the resolved value: a page full of cards
//calls getPrices() once per card at the same time, and caching only the result would mean every
//one of those calls sees an empty cache and fires its own request for the whole table.
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

//cheapest price per wear tier and variant: { FN: { normal: 12.34, stattrak: 45.67 }, ... }
export async function getPrices(defIndex, paintIndex) {
    const cache = await getPriceCache();
    const entry = cache[`${defIndex}:${paintIndex}`];
    return entry ? entry.data : null;
}

//cheapest price for a non-skin item - a plain number, or null if it was never priced
export async function getItemPrice(id) {
    const cache = await getItemPriceCache();
    const entry = cache[id];
    return entry ? entry.data : null;
}

//Full breakdown for one skin: { FN: { normal: { csfloat: { price, link }, ... } } }.
//Not cached in bulk - it's one small request per detail page view.
export async function getSkinMarkets(defIndex, paintIndex) {
    const res = await fetch(`/api/prices/${defIndex}-${paintIndex}`);
    if (!res.ok) return null;
    const grid = await res.json();
    return Object.keys(grid).length ? grid : null;
}

//Full breakdown for one non-skin item: { csfloat: { price, link }, ... }
export async function getItemMarkets(id) {
    const res = await fetch(`/api/item-prices/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const markets = await res.json();
    return Object.keys(markets).length ? markets : null;
}
