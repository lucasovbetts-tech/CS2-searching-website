let _cache = null;

export async function getSkins() {
    if (_cache) return _cache;
    const res = await fetch('data/skins.json');
    if (!res.ok) throw new Error('Failed to load skins.json');
    _cache = await res.json();
    return _cache;
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