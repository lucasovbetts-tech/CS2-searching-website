import { cachedJson } from './json-cache.js';

const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';

//every exported function below reads the same file, and callers routinely ask for several at once
//(search.js requests five in one Promise.all) - the shared promise keeps that to a single download
const getCrates = cachedJson(CRATES_URL, 'Failed to load crates.json');

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
