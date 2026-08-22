import './env.js'; // must stay the first import so env.js is loaded first
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pg from 'pg';
import { setupAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SKINS_PATH = path.join(ROOT, 'data', 'skins.json');

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
const PORT = process.env.PORT || 3001;

//credentials:true and an explicit origin, not the wildcard - a wildcard origin makes browsers
//refuse to send the session cookie, so sign-in would appear to work and then not stick
app.use(cors({ origin: process.env.BASE_URL || true, credentials: true }));

//before the routes below, so anything added later can read req.user
setupAuth(app, pool);

// serves the frontend from the same origin as the API, so prices.js never needs an environment-specific backend URL
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/data', express.static(path.join(ROOT, 'data')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

//built once at startup, not per-request - skins.json only changes when scripts/sync-catalog.js re-runs.
//Maps "defIndex:paintIndex:wearTier:variant" -> item_id, bridging price_history's wear_tier/variant keys
//back to the item_id the redirect link needs.
function buildSkinItemIdLookup() {
    const skins = JSON.parse(fs.readFileSync(SKINS_PATH, 'utf-8'));
    const lookup = new Map();
    for (const skin of skins) {
        if (!skin.itemIds) continue;
        for (const [key, itemId] of Object.entries(skin.itemIds)) {
            if (itemId == null) continue;
            lookup.set(`${skin.defIndex}:${skin.paintIndex}:${key}`, itemId);
        }
    }
    return lookup;
}
const skinItemIdLookup = buildSkinItemIdLookup();

//CS2Cap's tracked redirect pattern
function cs2capLink(provider, itemId) {
    return `https://cs2c.app/r/${provider}/${itemId}`;
}

//every skin's current price, shaped as { "defIndex:paintIndex": { data: { wearTier: { variant: { market: { price, link } } } } } }
//DISTINCT ON keeps one row per (def_index, paint_index, wear_tier, variant, market) group; paired with
//"ORDER BY ... fetched_at DESC" that row is always the newest snapshot - older rows stay in the table for history.
app.get('/api/prices', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT DISTINCT ON (def_index, paint_index, wear_tier, variant, market)
                def_index, paint_index, wear_tier, variant, market, price
            FROM price_history
            ORDER BY def_index, paint_index, wear_tier, variant, market, fetched_at DESC
        `);

        const cache = {};
        for (const row of rows) {
            const key = `${row.def_index}:${row.paint_index}`;
            cache[key] ??= { data: {} };
            cache[key].data[row.wear_tier] ??= {};
            cache[key].data[row.wear_tier][row.variant] ??= {};

            const itemId = skinItemIdLookup.get(`${row.def_index}:${row.paint_index}:${row.wear_tier}:${row.variant}`);
            cache[key].data[row.wear_tier][row.variant][row.market] = {
                price: Number(row.price), //pg returns NUMERIC columns as strings
                link: itemId != null ? cs2capLink(row.market, itemId) : null,
            };
        }

        res.json(cache);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load prices' });
    }
});

//same idea as /api/prices, but for non-skin items (agents, charms, stickers, etc.) - simpler shape since
//item_price_history already stores item_id directly, no lookup table needed to build the redirect link
app.get('/api/item-prices', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT DISTINCT ON (item_id, market)
                item_id, market, price
            FROM item_price_history
            ORDER BY item_id, market, fetched_at DESC
        `);

        const cache = {};
        for (const row of rows) {
            cache[row.item_id] ??= { data: {} };
            cache[row.item_id].data[row.market] = {
                price: Number(row.price),
                link: cs2capLink(row.market, row.item_id),
            };
        }

        res.json(cache);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load item prices' });
    }
});

app.listen(PORT, () => console.log(`Price server listening on http://localhost:${PORT}`));