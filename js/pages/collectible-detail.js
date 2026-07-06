import { getAgents, getCharms, getPatches, getMusicKits, getGraffiti, getPins } from '../api/collectibles.js';

//same darken/gradient look the explore skin-cards use, kept in sync by hand since there's no shared module for it yet
function darken(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function rarityGradient(hex) {
    return `radial-gradient(ellipse at 50% 35%, ${hex} 0%, ${darken(hex, 0.4)} 55%, ${darken(hex, 0.1)} 100%)`;
}

//kept in sync by hand with explore.js's COLLECTIBLE_TYPES - same slugs, fetches, and csfloat query params
const COLLECTIBLE_TYPES = {
    agents: { fetch: getAgents, csfloatParam: 'def_index' },
    charms: { fetch: getCharms, csfloatParam: 'keychain_index' },
    patches: { fetch: getPatches, csfloatParam: 'sticker_index' },
    'music-kits': { fetch: getMusicKits, csfloatParam: 'music_kit_index' },
    graffiti: { fetch: getGraffiti, csfloatParam: null }, //CSFloat doesn't sell graffiti, so there's no link for this type
    pins: { fetch: getPins, csfloatParam: 'def_index' },
};

//renders the page for one specific collectible item, routed to as "#/collectible/<slug>/<id>"
export function renderCollectibleDetail(param) {
    const [slug, id] = (param || '').split('/');
    const app = document.getElementById('app');

    app.innerHTML = `
        <div class="skin-detail-page">
            <p class="explore-loading">Loading…</p>
        </div>
    `;

    const type = COLLECTIBLE_TYPES[slug];
    if (!type) {
        app.innerHTML = `
            <div class="skin-detail-page">
                <button class="explore-back" onclick="window.history.back()">← Back</button>
                <p class="explore-empty">Unknown collectible type.</p>
            </div>`;
        return;
    }

    return type.fetch().then(items => {
        const container = document.querySelector('.skin-detail-page');
        if (!container) return;

        const item = items.find(i => i.id === id);

        if (!item) {
            container.innerHTML = `
                <button class="explore-back" onclick="window.history.back()">← Back</button>
                <p class="explore-empty">Item not found.</p>`;
            return;
        }

        const csfloatLink = type.csfloatParam ? `https://csfloat.com/search?${type.csfloatParam}=${item.def_index}` : null;

        container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <div class="skin-detail-layout">
                <div class="skin-detail-art" style="background: ${rarityGradient(item.rarity.color)}">
                    <span class="skin-rarity">${item.rarity.name}</span>
                    ${item.image ? `<img class="skin-detail-img" src="${item.image}" alt="${item.name}">` : '<div class="skin-img-placeholder"></div>'}
                </div>
                <div class="skin-detail-info">
                    <h1 class="skin-detail-name">${item.name}</h1>
                    ${item.description ? `<p class="skin-detail-desc">${item.description.replace(/\\n/g, '<br><br>')}</p>` : ''}
                    ${csfloatLink ? `<a class="csfloat-link" href="${csfloatLink}" target="_blank" rel="noopener">View on CSFloat</a>` : ''}
                </div>
            </div>
        `;
    }).catch(() => {
        const container = document.querySelector('.skin-detail-page');
        if (container) container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <p class="explore-empty">Failed to load item.</p>`;
    });
}
