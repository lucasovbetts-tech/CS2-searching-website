import './env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'cs2capmarkets.json');

async function fetchMarkets() {
    const res = await fetch('https://api.cs2c.app/v1/providers', {
        headers: { Authorization: `Bearer ${process.env.CS2CAP_API_KEY}` }
    });
    if (!res.ok) throw new Error(`CS2Cap /providers request failed: ${res.status}`);
    const providers = await res.json();

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(providers, null, 2));
    console.log('Wrote', Object.keys(providers).length, 'markets ->', OUTPUT_PATH);
}

fetchMarkets().catch(err => {
    console.error(err);
    process.exit(1);
});

//to re-run: "node server/cs2capMarkets.js" from the repo root