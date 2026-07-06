const fs = require('fs');
const path = require('path');

const SKINS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'skins.json');

async function syncSkins() {
    console.log('Fetching latest skins from', SKINS_URL);
    const res = await fetch(SKINS_URL);
    if (!res.ok) throw new Error('Failed to fetch skins.json: ' + res.status);
    const apiSkins = await res.json();

    const skins = apiSkins
        .filter(s => s.pattern && s.pattern.name) //drops vanilla knives with no finish, e.g. "★ Karambit" on its own
        .map(s => ({
            weapon: s.weapon.name,
            name: s.pattern.name,
            image: s.image,
            description: s.description,
            rarity: s.rarity,
            minFloat: s.min_float,
            maxFloat: s.max_float,
            stattrak: s.stattrak,
            souvenir: s.souvenir,
            phase: s.phase,
            category: s.category.name,
            defIndex: s.weapon.weapon_id, //CSFloat's search uses def_index + paint_index to identify a skin, e.g. csfloat.com/search?def_index=7&paint_index=282
            paintIndex: Number(s.paint_index)
        }));

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(skins, null, 2));
    console.log('Wrote', skins.length, 'skins to', OUTPUT_PATH);
}

syncSkins().catch(err => {
    console.error(err);
    process.exit(1);
});

//to re-sync run "node scripts/sync-skins.js" into console