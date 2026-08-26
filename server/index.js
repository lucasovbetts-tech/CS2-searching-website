import './env.js'; // must stay the first import so env.js is loaded first
import express from 'express';
import cors from 'cors';
import compression from 'compression';
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

//gzip every response - the price payloads are highly repetitive JSON and compress ~10:1
app.use(compression());

//credentials:true and an explicit origin, not the wildcard - a wildcard origin makes browsers
//refuse to send the session cookie, so sign-in would appear to work and then not stick
app.use(cors({ origin: process.env.BASE_URL || true, credentials: true }));

// Serves the frontend from the same origin as the API, so prices.js never needs an
// environment-specific backend URL.
//
// Deliberately ahead of setupAuth: these files are public and never read req.user, and one
// page load pulls ~35 of them (28 ES modules alone). Behind the session middleware, every
// one of those would trigger a session lookup - a Postgres round-trip per file once signed in.
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/data', express.static(path.join(ROOT, 'data')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

//before the API routes below, so anything added later can read req.user
setupAuth(app, pool);

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

//Bulk endpoint: the CHEAPEST price per skin/wear/variant, nothing else. Shaped as
//  { "defIndex:paintIndex": { data: { wearTier: { variant: <price> } } } }
//The grids (explore, tradeup) only ever take Math.min() across markets, so shipping every
//market's price and redirect link to them was ~29MB of payload to produce one number.
//Detail pages get the full breakdown from /api/prices/:def-:paint below instead.
app.get('/api/prices', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT def_index, paint_index, wear_tier, variant, price FROM current_skin_cheapest`
        );

        const cache = {};
        for (const row of rows) {
            const key = `${row.def_index}:${row.paint_index}`;
            cache[key] ??= { data: {} };
            cache[key].data[row.wear_tier] ??= {};
            cache[key].data[row.wear_tier][row.variant] = Number(row.price); //pg returns NUMERIC as strings
        }

        res.json(cache);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load prices' });
    }
});

//One skin's full per-market breakdown, fetched only when a detail page opens.
//  { wearTier: { variant: { market: { price, link } } } }
app.get('/api/prices/:defIndex-:paintIndex', async (req, res) => {
    const defIndex = Number(req.params.defIndex);
    const paintIndex = Number(req.params.paintIndex);
    if (!Number.isInteger(defIndex) || !Number.isInteger(paintIndex)) {
        return res.status(400).json({ error: 'Invalid skin id' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT wear_tier, variant, market, price
             FROM current_skin_markets
             WHERE def_index = $1 AND paint_index = $2`,
            [defIndex, paintIndex]
        );

        const grid = {};
        for (const row of rows) {
            grid[row.wear_tier] ??= {};
            grid[row.wear_tier][row.variant] ??= {};

            const itemId = skinItemIdLookup.get(`${defIndex}:${paintIndex}:${row.wear_tier}:${row.variant}`);
            grid[row.wear_tier][row.variant][row.market] = {
                price: Number(row.price),
                link: itemId != null ? cs2capLink(row.market, itemId) : null,
            };
        }

        res.json(grid);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load skin prices' });
    }
});

//Same split for non-skin items (stickers, agents, charms, ...): cheapest in bulk...
app.get('/api/item-prices', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT item_id, price FROM current_item_cheapest`);

        const cache = {};
        for (const row of rows) cache[row.item_id] = { data: Number(row.price) };

        res.json(cache);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load item prices' });
    }
});

//...and the full per-market breakdown for one item on demand
app.get('/api/item-prices/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT market, price FROM current_item_markets WHERE item_id = $1`,
            [String(req.params.id)]
        );

        const markets = {};
        for (const row of rows) {
            markets[row.market] = {
                price: Number(row.price),
                link: cs2capLink(row.market, req.params.id),
            };
        }

        res.json(markets);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load item prices' });
    }
});

app.listen(PORT, () => console.log(`Price server listening on http://localhost:${PORT}`));