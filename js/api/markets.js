import { cachedJson } from './json-cache.js';

const loadMarkets = cachedJson('data/cs2capmarkets.json', 'Failed to load cs2capmarkets.json');

let _cache = null;

//keyed by lowercase provider key (e.g. "csfloat") to match price objects' keys directly,
//not by the display name ("CSFloat") cs2capmarkets.json itself is keyed by
export async function getMarkets() {
    if (!_cache) _cache = loadMarkets().then(raw => Object.fromEntries(Object.values(raw).map(m => [m.key, m])));
    return _cache;
}
