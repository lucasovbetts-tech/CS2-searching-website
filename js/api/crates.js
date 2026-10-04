import { cachedJson } from './json-cache.js';

const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';
//written by scripts/sync-catalog.js - ByMykel's crates.json carries no CS2Cap id, so a container can't be
//priced without this. Only the id/name bridge lives here; everything else still comes from ByMykel.
const CRATE_IDS_URL = '/data/crates.json';

//every exported function below reads the same file, and callers routinely ask for several at once
//(search.js requests five in one Promise.all) - the shared promise keeps that to a single download
const getCrates = cachedJson(CRATES_URL, 'Failed to load crates.json');
const getCrateIds = cachedJson(CRATE_IDS_URL, 'Failed to load crate ids');

//CS2Cap item_id for one container, by name. null for the ~39 old tournament capsules CS2Cap doesn't list.
//Memoized as a Map rather than scanning 467 entries per lookup, and the promise is cached the same way
//cachedJson does it, so concurrent callers share one build.
let _idByName = null;
export async function getCrateId(name) {
    if (!_idByName) _idByName = getCrateIds().then(list => new Map(list.map(c => [c.name, c.id])));
    return (await _idByName).get(name) ?? null;
}

const TOURNAMENT_PATTERN = /Legends|Challengers|Contenders/i; //matches per-team Major/RMR sticker capsules, e.g. "Katowice 2019 Legends"

export async function getStickerCapsules() {
    const crates = await getCrates();
    return crates.filter(c => c.type === 'Sticker Capsule');
}

export async function getNonTournamentStickerCapsules() {
    const crates = await getCrates();
    return crates.filter(c => c.type === 'Sticker Capsule' && !TOURNAMENT_PATTERN.test(c.name));
}

export async function getSouvenirPackages() {
    const crates = await getCrates();
    return crates.filter(c => c.type === 'Souvenir');
}

export async function getCases() {
    const crates = await getCrates();
    //type === 'Case' catches the normal ones, but some containers (e.g. "Sealed Dead Hand Terminal") have a real
    //contains_rare gold pool - genuinely function as a case - without actually being typed 'Case' in the source data
    return crates.filter(c => c.type === 'Case' || (c.contains_rare && c.contains_rare.length > 0));
}
