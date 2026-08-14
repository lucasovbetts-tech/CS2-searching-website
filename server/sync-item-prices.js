import './env.js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CS2CAP_API_KEY = process.env.CS2CAP_API_KEY;
if (!CS2CAP_API_KEY) throw new Error('CS2CAP_API_KEY not set in server/.env');

//every non-skin catalog file - not highlights.json, which has no item_id to price against
const ITEM_FILES = ['agents.json', 'charms.json', 'patches.json', 'music-kits.json', 'graffiti.json', 'stickers.json', 'collectibles.json'];

const CS2CAP_PRICES_URL = 'https://api.cs2c.app/v1/prices/batch';
const BATCH_SIZE = 100;
const RATE_LIMIT_PER_MINUTE = 40;
const MIN_REQUEST_INTERVAL_MS = Math.ceil(60000 / RATE_LIMIT_PER_MINUTE);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function fetchAllPrices(allItemIds) {
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

//flat list of every ITEM_FILES entry's item_id
function loadAllItemIds() {
    const ids = [];
    for (const file of ITEM_FILES) {
        const items = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
        for (const item of items) {
            if (item.id == null) continue;
            ids.push(Number(item.id));
        }
    }
    return ids;
}

//one row per (item, market) quote
async function insertPrices(pricedItems) {
    let inserted = 0;
    for (const item of pricedItems) {
        for (const quote of item.quotes) {
            const price = quote.lowest_ask / 100; //minor units (cents) -> dollars
            await pool.query(
                `INSERT INTO item_price_history (item_id, market, price)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (item_id, market, fetched_at) DO NOTHING`,
                [String(item.item_id), quote.provider, price]
            );
            inserted++;
        }
    }
    return inserted;
}

async function sync() {
    const allItemIds = loadAllItemIds();
    console.log(`Fetching prices for ${allItemIds.length} non-skin items (agents, charms, patches, music kits, graffiti, stickers, collectibles)...`);

    const pricedItems = await fetchAllPrices(allItemIds);
    console.log(`Got prices for ${pricedItems.length} items - inserting into item_price_history...`);

    const inserted = await insertPrices(pricedItems);
    console.log(`Inserted ${inserted} price rows.`);

    await pool.end();
}

sync().catch(err => {
    console.error(err);
    process.exit(1);
});

//run with: node sync-item-prices.js (from inside server/)
