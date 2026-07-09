import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKINS_PATH = path.join(__dirname, '..', 'data', 'skins.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'prices.json');

const MARKET_API_KEY = process.env.MARKET_API_KEY;
const BATCH_SIZE = 100;       // upstream limit per request
const REQUEST_GAP_MS = 3500;  // 21 batches at this gap stays well under the 20 req/min cap

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBatchPrices(batch) {
    // TODO: replace with your provider's actual bulk-price endpoint/request format.
    // This is the only place the upstream API is called and the only place the key is used.
    const res = await fetch('https://REPLACE_WITH_PROVIDER_HOST/bulk-prices', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: MARKET_API_KEY
        },
        body: JSON.stringify({
            items: batch.map(s => ({ defIndex: s.defIndex, paintIndex: s.paintIndex }))
        })
    });

    if (!res.ok) throw new Error(`Batch request failed: ${res.status}`);
    return res.json(); // expected shape: [{ defIndex, paintIndex, price }, ...]
}

export async function syncPrices() {
    if (!MARKET_API_KEY) {
        console.warn('MARKET_API_KEY is not set in server/.env — skipping price sync.');
        return;
    }

    const skins = JSON.parse(fs.readFileSync(SKINS_PATH, 'utf-8'));
    const batches = chunk(skins, BATCH_SIZE);
    console.log(`Syncing prices for ${skins.length} skins across ${batches.length} requests...`);

    const prices = {};
    for (const [i, batch] of batches.entries()) {
        try {
            const results = await fetchBatchPrices(batch);
            for (const r of results) {
                prices[`${r.defIndex}:${r.paintIndex}`] = r.price;
            }
        } catch (err) {
            console.error(`Batch ${i + 1}/${batches.length} failed:`, err.message);
        }

        if (i < batches.length - 1) await sleep(REQUEST_GAP_MS);
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(prices, null, 2));
    console.log(`Wrote prices for ${Object.keys(prices).length} skins to ${OUTPUT_PATH}`);
}
