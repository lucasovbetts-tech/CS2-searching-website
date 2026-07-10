import { wearTiersFor } from '../js/utils/wear-tiers.js';
import { marketHashName } from '../js/utils/market-hash-name.js';

const CSMARKETAPI_KEY = process.env.CSMARKETAPI_API_KEY;

// CSDEALS excluded: its prices come back wildly out of line with every other market (e.g. a real
// listing showing 3910 when everywhere else agrees on ~150), not usable data
const MARKETS = ['CSFLOAT', 'CSMONEY', 'GAMERPAYGG', 'MARKETCSGO', 'SKINBARON', 'SKINPORT', 'WHITEMARKET'];

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAggregateOnce(name) {
    const params = new URLSearchParams({ market_hash_name: name, key: CSMARKETAPI_KEY, currency: 'USD' });
    for (const m of MARKETS) params.append('markets', m);

    const res = await fetch(`https://api.csmarketapi.com/v1/listings/latest/aggregate?${params}`);
    if (res.status === 404) return {}; // not every wear/variant combo actually exists as a real listed item

    if (!res.ok) throw new Error(`CSMarketAPI request failed: ${res.status}`);

    const { listings } = await res.json();
    const prices = {};
    for (const l of listings) {
        if (l.min_price != null) prices[l.market.toLowerCase()] = l.min_price;
    }
    return prices;
}

//retries transient failures (e.g. the odd 403 we saw under heavy request load) before giving up on this one cell.
//404 isn't retried above - it means "no listing exists", not a failure - so it never reaches here
async function fetchAggregate(name) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await fetchAggregateOnce(name);
        } catch (err) {
            lastErr = err;
            if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
        }
    }
    throw lastErr;
}

//fetches one tier's price across every variant the skin has, tolerating per-cell failures instead of
//throwing - hadFailure tells the caller not to cache a result that includes a failed cell
async function fetchTierPrices(skin, tier, variants, hadFailureRef) {
    const cell = {};
    for (const variant of variants) {
        const name = marketHashName(skin, tier.label, variant);
        try {
            cell[variant] = await fetchAggregate(name);
        } catch (err) {
            console.error(`CSMarketAPI cell failed (${name}):`, err.message);
            cell[variant] = null;
            hadFailureRef.value = true;
        }
    }
    return cell;
}

//full wear-tier x variant grid, each cell aggregated across every marketplace CSMarketAPI covers in one
//request — no per-item batching exists on this API, but the 1M/month quota makes that a non-issue.
//souvenir is skipped: same spotty coverage problem seen on CSFloat (tested "Souvenir AK-47 | Redline" -> 404)
//returns { prices, hadFailure } - hadFailure tells the caller not to cache this result, since a cell
//that failed (as opposed to genuinely having no listings) shouldn't get remembered as fact for a whole cache window
export async function getCsMarketApiPrices(skin) {
    const tiers = wearTiersFor(skin);
    const variants = ['normal', ...(skin.stattrak ? ['stattrak'] : [])];
    const hadFailureRef = { value: false };

    const prices = {};
    for (const tier of tiers) {
        prices[tier.key] = await fetchTierPrices(skin, tier, variants, hadFailureRef);
    }
    return { prices, hadFailure: hadFailureRef.value };
}

//just the 2 extreme wear tiers (lowest float = best condition, highest float = worst) instead of the
//full grid - built for skin-card price ranges (e.g. a weapon page showing all its skins at once),
//where fetching every tier for every card would be far more requests than the range actually needs
export async function getPriceRangeForSkin(skin) {
    const tiers = wearTiersFor(skin);
    if (!tiers.length) return { lowTier: null, highTier: null, low: {}, high: {}, hadFailure: false };

    const lowTier = tiers[0];
    const highTier = tiers[tiers.length - 1];
    const variants = ['normal', ...(skin.stattrak ? ['stattrak'] : [])];
    const hadFailureRef = { value: false };

    const low = await fetchTierPrices(skin, lowTier, variants, hadFailureRef);
    const high = lowTier.key === highTier.key ? low : await fetchTierPrices(skin, highTier, variants, hadFailureRef);

    return { lowTier: lowTier.key, highTier: highTier.key, low, high, hadFailure: hadFailureRef.value };
}

async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

const RANGE_CONCURRENCY = 10;

//fetches price ranges for many skins at once (e.g. every skin of one weapon), capped at a modest
//concurrency so a big weapon page doesn't fire dozens of requests all at the exact same instant
export async function getPriceRangesForSkins(skins) {
    return mapWithConcurrency(skins, RANGE_CONCURRENCY, getPriceRangeForSkin);
}
