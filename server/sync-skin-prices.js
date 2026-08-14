import './env.js';
import pg from 'pg'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKINS_PATH = path.join(__dirname, '..', 'data', 'skins.json');

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CS2CAP_API_KEY = process.env.CS2CAP_API_KEY;
if (!CS2CAP_API_KEY) throw new Error('CS2CAP_API_KEY not set in server/.env');

//reads skins.json and builds a lookup from CS2Cap's item_id back to which skin/wear/variant it belongs to,
//since /prices/batch's response only carries item_id per result
function loadItemIdMap() {
    const skins = JSON.parse(fs.readFileSync(SKINS_PATH, 'utf-8'));
    const itemIdToSkin = new Map();
    for (const skin of skins) {
        if (!skin.itemIds) continue;
        for (const [key, itemId] of Object.entries(skin.itemIds)) {
            if (itemId == null) continue;
            const [wearTier, variant] = key.split(':');
            itemIdToSkin.set(itemId, { defIndex: skin.defIndex, paintIndex: skin.paintIndex, wearTier, variant });
        }
    }
    return itemIdToSkin;
}

//POST, up to 100 item_ids per request, no server-side pagination
const CS2CAP_PRICES_URL = 'https://api.cs2c.app/v1/prices/batch';
const BATCH_SIZE = 100;

//Starter tier limit - spaced evenly across the minute rather than firing 40 requests immediately then idling
const RATE_LIMIT_PER_MINUTE = 40;
const MIN_REQUEST_INTERVAL_MS = Math.ceil(60000 / RATE_LIMIT_PER_MINUTE);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//one batch of up to 100 items - on a 429, waits for the server's own Retry-After then retries the same batch
async function fetchPriceBatch(itemIds) {
    const res = await fetch(CS2CAP_PRICES_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${CS2CAP_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ item_ids: itemIds, currency: 'USD' }),
    });

    if (res.status === 429) {
        const retryAfterSeconds = Number(res.headers.get('Retry-After')) || 60;
        console.warn(`Rate limited - waiting ${retryAfterSeconds}s before retrying this batch of ${itemIds.length}`);
        await sleep(retryAfterSeconds * 1000);
        return fetchPriceBatch(itemIds);
    }

    if (!res.ok) throw new Error(`CS2Cap prices request failed: ${res.status}`);
    return res.json();
}

//chunks allItemIds into batches of 100 and paces requests MIN_REQUEST_INTERVAL_MS apart to stay under the rate limit
async function fetchAllSkinPrices(allItemIds) {
    const allItems = [];
    const allNotFound = [];

    for (let i = 0; i < allItemIds.length; i += BATCH_SIZE) {
        const batchIds = allItemIds.slice(i, i + BATCH_SIZE);
        const { items, items_not_found } = await fetchPriceBatch(batchIds);
        allItems.push(...items);
        allNotFound.push(...items_not_found);

        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allItemIds.length / BATCH_SIZE);
        console.log(`Batch ${batchNum}/${totalBatches}: ${items.length} priced, ${items_not_found.length} not found (${allItems.length} total so far)`);

        const isLastBatch = i + BATCH_SIZE >= allItemIds.length;
        if (!isLastBatch) await sleep(MIN_REQUEST_INTERVAL_MS);
    }

    if (allNotFound.length) console.warn(`${allNotFound.length} item_ids returned no price data:`, allNotFound);
    return allItems;
}

//maps each priced result back to its skin via itemIdToSkin, then inserts one row per (item, market) quote
async function insertPrices(pricedItems, itemIdToSkin) {
    let inserted = 0;
    for (const item of pricedItems) {
        const skin = itemIdToSkin.get(item.item_id);
        if (!skin) {
            console.warn(`No skin found for item_id ${item.item_id} (${item.market_hash_name}) - skipping`);
            continue;
        }
        for (const quote of item.quotes) {
            const price = quote.lowest_ask / 100; //minor units (cents) -> dollars
            await pool.query(
                `INSERT INTO price_history (def_index, paint_index, wear_tier, variant, market, price)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (def_index, paint_index, wear_tier, variant, market, fetched_at) DO NOTHING`,
                [skin.defIndex, skin.paintIndex, skin.wearTier, skin.variant, quote.provider, price]
            );
            inserted++;
        }
    }
    return inserted;
}

async function sync() {
    const itemIdToSkin = loadItemIdMap();
    const allItemIds = [...itemIdToSkin.keys()];
    console.log(`Fetching prices for ${allItemIds.length} skin listings...`);

    const pricedItems = await fetchAllSkinPrices(allItemIds);
    console.log(`Got prices for ${pricedItems.length} items - inserting into price_history...`);

    const inserted = await insertPrices(pricedItems, itemIdToSkin);
    console.log(`Inserted ${inserted} price rows.`);

    await pool.end();
}

sync().catch(err => {
    console.error(err);
    process.exit(1);
});

//run with: node sync-skin-prices.js (from inside server/)