export const WEAR_TIERS = [
    { key: 'FN', label: 'Factory New',    min: 0,    max: 0.07 },
    { key: 'MW', label: 'Minimal Wear',   min: 0.07, max: 0.15 },
    { key: 'FT', label: 'Field-Tested',   min: 0.15, max: 0.38 },
    { key: 'WW', label: 'Well-Worn',      min: 0.38, max: 0.45 },
    { key: 'BS', label: 'Battle-Scarred', min: 0.45, max: 1 },
];


export function wearTiersFor(s) {
    return WEAR_TIERS.filter(t => s.minFloat < t.max && s.maxFloat > t.min);
}
