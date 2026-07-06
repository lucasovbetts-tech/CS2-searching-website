import { getStickers } from '../api/collectibles.js';

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

//renders the page for one specific sticker, routed to as "#/sticker/<id>" since that's the id already shared between stickers.json and a capsule's own contains list
export function renderStickerDetail(param) {
    const app = document.getElementById('app');

    app.innerHTML = `
        <div class="skin-detail-page">
            <p class="explore-loading">Loading…</p>
        </div>
    `;

    return getStickers().then(stickers => {
        const container = document.querySelector('.skin-detail-page');
        if (!container) return;

        const s = stickers.find(item => item.id === param);

        if (!s) {
            container.innerHTML = `
                <button class="explore-back" onclick="window.history.back()">← Back</button>
                <p class="explore-empty">Sticker not found.</p>`;
            return;
        }

        const csfloatLink = `https://csfloat.com/search?sticker_index=${s.def_index}`;

        container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <div class="skin-detail-layout">
                <div class="skin-detail-art" style="background: ${rarityGradient(s.rarity.color)}">
                    <span class="skin-rarity">${s.rarity.name}</span>
                    ${s.image ? `<img class="skin-detail-img" src="${s.image}" alt="${s.name}">` : '<div class="skin-img-placeholder"></div>'}
                </div>
                <div class="skin-detail-info">
                    <h1 class="skin-detail-name">${s.name}</h1>
                    ${s.description ? `<p class="skin-detail-desc">${s.description.replace(/\\n/g, '<br><br>')}</p>` : ''}
                    <a class="csfloat-link" href="${csfloatLink}" target="_blank" rel="noopener">View on CSFloat</a>
                </div>
            </div>
        `;
    }).catch(() => {
        const container = document.querySelector('.skin-detail-page');
        if (container) container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <p class="explore-empty">Failed to load sticker.</p>`;
    });
}
