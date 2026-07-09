//builds the Steam-style listing name CS2Cap's market_hash_names filter expects,
//e.g. "StatTrak™ AK-47 | Redline (Field-Tested)" or "★ Bayonet | Doppler (Factory New)"
export function marketHashName(skin, wearLabel, variant = 'normal') {
    const star = (skin.category === 'Knives' || skin.category === 'Gloves') ? '★ ' : '';
    const prefix = variant === 'stattrak' ? 'StatTrak™ ' : variant === 'souvenir' ? 'Souvenir ' : '';
    return `${star}${prefix}${skin.weapon} | ${skin.name} (${wearLabel})`;
}
