import { wearTiersFor } from '../js/utils/wear-tiers.js';
import { marketHashName } from '../js/utils/market-hash-name.js';

const CSMARKETAPI_KEY = process.env.CSMARKETAPI_API_KEY;

// CSDEALS excluded: its prices come back wildly out of line with every other market (e.g. a real
// listing showing 3910 when everywhere else agrees on ~150), not usable data
const MARKETS = ['CSFLOAT', 'CSMONEY', 'GAMERPAYGG', 'MARKETCSGO', 'SKINBARON', 'SKINPORT', 'WHITEMARKET'];

async function fetchAggregate(name) {
    const params = new URLSearchParams({ market_hash_name: name, key: CSMARKETAPI_KEY, currency: 'USD' });
    for (const m of MARKETS) params.append('markets', m);

    const res = await fetch(`https://api.csmarketapi.com/v1/listings/latest/aggregate?${params}`);
    if (res.status === 404) return {}; // not every wear/variant combo exists as a real listed item - not a failure

    if (!res.ok) throw new Error(`CSMarketAPI request failed: ${res.status}`);

    const { listings } = await res.json();
    const prices = {};
    for (const l of listings) {
        if (l.min_price != null) prices[l.market.toLowerCase()] = l.min_price;
    }
    return prices;
}

async function fetchTierPrices(skin, tier, variants) {
    const cell = {};
    for (const variant of variants) {
        const name = marketHashName(skin, tier.label, variant);
        cell[variant] = await fetchAggregate(name);
    }
    return cell;
}

export async function getCsMarketApiPrices(skin) {
    const tiers = wearTiersFor(skin);
    const variants = ['normal', ...(skin.stattrak ? ['stattrak'] : [])];

    const prices = {};
    for (const tier of tiers) {
        prices[tier.key] = await fetchTierPrices(skin, tier, variants);
    }
    return prices;
}

//just the 2 extreme wear tiers, not the full grid - built for skin-card price ranges (e.g. a weapon page
//showing all its skins at once), where fetching every tier for every card would be far more requests than needed
export async function getPriceRangeForSkin(skin) {
    const tiers = wearTiersFor(skin);
    if (!tiers.length) return { lowTier: null, highTier: null, low: {}, high: {} };

    const lowTier = tiers[0];
    const highTier = tiers[tiers.length - 1];
    const variants = ['normal', ...(skin.stattrak ? ['stattrak'] : [])];

    const low = await fetchTierPrices(skin, lowTier, variants);
    const high = lowTier.key === highTier.key ? low : await fetchTierPrices(skin, highTier, variants);

    return { lowTier: lowTier.key, highTier: highTier.key, low, high };
}

export async function getPriceRangesForSkins(skins) {
    return Promise.all(skins.map(getPriceRangeForSkin));
}
