import { cachedJson } from './json-cache.js';

const loadSkins = cachedJson('data/skins.json', 'Failed to load skins.json');

export async function getSkins() {
    return loadSkins();
}

export async function getSkinsByWeapon(weapon) {
    const skins = await getSkins();
    return skins.filter(s => s.weapon === weapon);
}

//defIndex+paintIndex together are unique per skin (unlike weapon+name, which collides on doppler phases), so this is what skin detail routes look up by
export async function getSkinByIndex(defIndex, paintIndex) {
    const skins = await getSkins();
    return skins.find(s => s.defIndex === defIndex && s.paintIndex === paintIndex);
}
