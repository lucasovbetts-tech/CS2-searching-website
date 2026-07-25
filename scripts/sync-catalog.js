const fs = require('fs');
const path = require('path');

const CS2CAP_ITEMS_URL = 'https://api.cs2c.app/v1/items';
const BYMYKEL_BASE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en';
const DATA_DIR = path.join(__dirname, '..', 'data');
const ENV_PATH = path.join(__dirname, '..', 'server', '.env');

function loadCs2capKey() {
    const envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    const match = envContent.match(/^CS2CAP_API_KEY=(.+)$/m);
    if (!match) throw new Error('CS2CAP_API_KEY not set in server/.env');
    return match[1].trim();
}

async function fetchByMykel(file) {
    const res = await fetch(`${BYMYKEL_BASE}/${file}.json`);
    if (!res.ok) throw new Error(`Failed to fetch ByMykel ${file}.json: ${res.status}`);
    return res.json();
}

//CS2Cap's catalog has no description field at all, on any item type - ByMykel is kept around just for
//this one field, keyed by def_index (skins additionally key on paint_index, since one weapon def_index covers many patterns)
function descByDefIndex(byMykelItems) {
    const map = new Map();
    for (const item of byMykelItems) map.set(Number(item.def_index), item.description);
    return map;
}

function normalizeRarity(item) {
    return {
        name: item.rarity_name,
        color: item.rarity_color.startsWith('#') ? item.rarity_color : `#${item.rarity_color}`,
    };
}

function normalizeCrates(item) {
    return item.crates.filter(Boolean).map((name, i) => ({ name, image: item.crates_images[i] }));
}

function writeJson(filename, data) {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
    console.log('Wrote', data.length, '->', filename);
}

function buildSkins(cs2capItems, byMykelSkins) {
    const descByKey = new Map();
    for (const s of byMykelSkins) {
        //vanilla knives (no pattern) key on paint_index 0 - Valve's own sentinel for "no paint applied",
        //matching the 0 given to vanilla knives below
        const paintIndex = s.paint_index != null ? Number(s.paint_index) : 0;
        descByKey.set(`${s.weapon.weapon_id}:${paintIndex}`, s.description);
    }

    //one CS2Cap item = one exact tradable listing (skin x wear x StatTrak/souvenir variant), so every
    //wear/variant row for the same skin gets grouped back into a single skins.json record. Vanilla knives
    //(item_type Weapon, no skin_name - confirmed live to be exactly the 20 knife types, nothing else) are kept;
    //everything else with no skin_name (stickers, agents, etc.) already has its own item_type and never reaches here.
    //
    //paint_index alone isn't a safe group key: Doppler-family skins (and vanilla knives) all share
    //paint_index null regardless of which actual skin they are (e.g. Bayonet's Doppler and Gamma Doppler -
    //two entirely different skins - both key on "500:null"), so skin_name + phase are included too to
    //keep those apart. Confirmed live: this correctly splits them into separate groups of the right size.
    const groups = new Map();
    for (const item of cs2capItems) {
        if (item.item_type !== 'Weapon') continue;
        const groupKey = `${item.def_index}:${item.paint_index}:${item.skin_name}:${item.phase}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(item);
    }

    return [...groups.values()].flatMap(group => {
        const first = group[0];
        const isVanilla = first.skin_name == null;
        //paint_index 0 is Valve's real sentinel for "no paint applied", safe to assign to true vanilla knives.
        //Anything else with a null paint_index (seen for a handful of stray Doppler-family entries whose real
        //phase-specific versions already exist elsewhere in the catalog with proper distinct paint indices) has
        //no reliable numeric identity to assign - assigning 0 would collide with vanilla's, so it's dropped instead
        if (!isVanilla && first.paint_index == null) return [];

        const defIndex = Number(first.def_index);
        const paintIndex = isVanilla ? 0 : Number(first.paint_index);
        return [{
            weapon: first.base_name,
            name: first.skin_name, //null for vanilla knives - no pattern applied
            vanilla: isVanilla,
            image: first.image_url,
            description: descByKey.get(`${defIndex}:${paintIndex}`) ?? null,
            rarity: normalizeRarity(first),
            collection: first.collection ? { name: first.collection, image: first.collection_image } : null,
            crates: normalizeCrates(first),
            minFloat: first.min_float,
            maxFloat: first.max_float,
            stattrak: group.some(i => i.is_stattrak),
            souvenir: group.some(i => i.is_souvenir),
            phase: first.phase,
            category: first.item_subtype,
            releaseDate: first.release_date,
            styleName: first.style_name,
            totalSupply: group.reduce((sum, i) => sum + (i.supply || 0), 0),
            defIndex,
            paintIndex,
        }];
    });
}

//shared shape for every non-skin catalog type: one CS2Cap item = one record, no wear/variant grouping needed
function buildSimpleItems(cs2capItems, { itemType, subtype, descriptions, includeType = false }) {
    const filtered = cs2capItems.filter(i => i.item_type === itemType && (!subtype || i.item_subtype === subtype));
    return filtered.map(item => {
        const defIndex = Number(item.def_index);
        const record = {
            id: String(item.item_id), //route params (URL hash) are always strings, so this must be too - see collectible-detail.js/sticker-detail.js's `i.id === id` lookups
            name: item.skin_name ?? item.base_name,
            marketHashName: item.market_hash_name,
            image: item.image_url,
            description: descriptions.get(defIndex) ?? null,
            rarity: normalizeRarity(item),
            collection: item.collection ? { name: item.collection, image: item.collection_image } : null,
            crates: normalizeCrates(item),
            releaseDate: item.release_date,
            defIndex,
        };
        if (includeType) record.type = item.item_subtype;
        return record;
    });
}

async function sync() {
    const key = loadCs2capKey();

    console.log('Fetching full catalog from CS2Cap...');
    const res = await fetch(CS2CAP_ITEMS_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Failed to fetch CS2Cap items: ${res.status}`);
    const { items: cs2capItems } = await res.json();

    console.log('Fetching descriptions + highlights from ByMykel/CSGO-API...');
    const [
        byMykelSkins, agentDesc, keychainDesc, patchDesc, musicKitDesc, graffitiDesc, stickerDesc, collectibleDesc, highlights,
    ] = await Promise.all([
        fetchByMykel('skins'), fetchByMykel('agents'), fetchByMykel('keychains'), fetchByMykel('patches'),
        fetchByMykel('music_kits'), fetchByMykel('graffiti'), fetchByMykel('stickers'), fetchByMykel('collectibles'),
        fetchByMykel('highlights'),
    ]);

    writeJson('skins.json', buildSkins(cs2capItems, byMykelSkins));
    writeJson('agents.json', buildSimpleItems(cs2capItems, { itemType: 'Agent', descriptions: descByDefIndex(agentDesc) }));
    //Charm covers 3 unrelated things on CS2Cap - "Normal" is the only one that matches ByMykel's keychains.json;
    //"Sticker Slab" (a charm-mounted version of every sticker) and "Highlight Reel" are intentionally excluded
    writeJson('charms.json', buildSimpleItems(cs2capItems, { itemType: 'Charm', subtype: 'Normal', descriptions: descByDefIndex(keychainDesc) }));
    writeJson('patches.json', buildSimpleItems(cs2capItems, { itemType: 'Patch', descriptions: descByDefIndex(patchDesc) }));
    writeJson('music-kits.json', buildSimpleItems(cs2capItems, { itemType: 'Music Kit', descriptions: descByDefIndex(musicKitDesc) }));
    writeJson('graffiti.json', buildSimpleItems(cs2capItems, { itemType: 'Graffiti', descriptions: descByDefIndex(graffitiDesc) }));
    writeJson('stickers.json', buildSimpleItems(cs2capItems, { itemType: 'Sticker', descriptions: descByDefIndex(stickerDesc) }));
    //kept ungrouped (Pin/Operation Pass/Tournament Pass together) with a type field, same shape ByMykel's
    //collectibles.json had - getPins() filters client-side same as before
    writeJson('collectibles.json', buildSimpleItems(cs2capItems, { itemType: 'Collectible', descriptions: descByDefIndex(collectibleDesc), includeType: true }));
    //cases/capsules/souvenirs intentionally NOT sourced from CS2Cap - it has no "what does this crate contain"
    //relationship at all (no contains/contains_rare equivalent), which explore.js's case/golds views depend on.
    //js/api/crates.js stays on ByMykel's live crates.json instead, which has that data.

    //straight copy - ByMykel is the only source with the actual clip video/thumbnail, CS2Cap's "Highlight Reel"
    //charm rows have neither, just a generic per-tournament icon
    writeJson('highlights.json', highlights);
}

sync().catch(err => {
    console.error(err);
    process.exit(1);
});

//to re-sync run "node scripts/sync-catalog.js" into console
