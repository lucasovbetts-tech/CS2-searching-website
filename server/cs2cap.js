import { wearTiersFor } from '../js/utils/wear-tiers.js';
import { marketHashName } from '../js/utils/market-hash-name.js';

const CS2CAP_API_KEY = process.env.CS2CAP_API_KEY;
const PROVIDERS = ['steam', 'buff163', 'buffmarket', 'csmoney_m', 'skinport', 'skinsmonkey', 'skinswap', 'pirateswap', 'skinvault', 'youpin'];

//prefer Field-Tested since it's the most commonly traded tier; fall back down the list for
//skins that don't have an FT range (e.g. most knives only span Factory New - Minimal Wear)
const TIER_PRIORITY = ['FT', 'FN', 'MW', 'WW', 'BS'];

function representativeTier(skin) {
    const applicable = wearTiersFor(skin);
    for (const key of TIER_PRIORITY) {
        const tier = applicable.find(t => t.key === key);
        if (tier) return tier;
    }
    return applicable[0] ?? null;
}

//only 1 request per skin (not per wear/variant) since CS2Cap's free tier is capped at 1000/month total
export async function getCs2capPrices(skin) {
    const tier = representativeTier(skin);
    if (!tier) return null;

    const name = marketHashName(skin, tier.label, 'normal');
    const params = new URLSearchParams({ market_hash_name: name, currency: 'USD' });
    for (const p of PROVIDERS) params.append('providers', p);

    const res = await fetch(`https://api.cs2c.app/v1/prices?${params}`, {
        headers: { Authorization: `Bearer ${CS2CAP_API_KEY}` }
    });
    if (!res.ok) throw new Error(`CS2Cap request failed: ${res.status}`);

    const json = await res.json();
    const prices = {};
    for (const item of json.items) {
        prices[item.provider] = item.lowest_ask / 100; // cents -> currency units
    }
    return { tier: tier.key, tierLabel: tier.label, prices };
}
