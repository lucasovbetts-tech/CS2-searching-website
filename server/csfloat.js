import { wearTiersFor } from '../js/utils/wear-tiers.js';

const CSFLOAT_API_KEY = process.env.CSFLOAT_API_KEY;
const CATEGORY = { normal: 1, stattrak: 2, souvenir: 3 };

async function fetchLowestAsk(defIndex, paintIndex, minFloat, maxFloat, category) {
    const params = new URLSearchParams({
        def_index: String(defIndex),
        paint_index: String(paintIndex),
        min_float: String(minFloat),
        max_float: String(maxFloat),
        category: String(category),
        sort_by: 'lowest_price',
        limit: '1'
    });

    const res = await fetch(`https://csfloat.com/api/v1/listings?${params}`, {
        headers: { Authorization: CSFLOAT_API_KEY }
    });
    if (!res.ok) throw new Error(`CSFloat request failed: ${res.status}`);

    const { data } = await res.json();
    return data[0] ? data[0].price / 100 : null; // cents -> currency units
}

//full wear-tier x variant grid — CSFloat's 200/hour cap comfortably covers a per-skin burst of up to 15 requests
export async function getCsfloatPrices(skin) {
    const tiers = wearTiersFor(skin);
    const variants = ['normal', ...(skin.stattrak ? ['stattrak'] : []), ...(skin.souvenir ? ['souvenir'] : [])];

    const result = {};
    for (const tier of tiers) {
        result[tier.key] = {};
        for (const variant of variants) {
            result[tier.key][variant] = await fetchLowestAsk(
                skin.defIndex, skin.paintIndex, tier.min, tier.max, CATEGORY[variant]
            );
        }
    }
    return result;
}
