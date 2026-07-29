import { getStickers } from '../api/collectibles.js';
import { getItemPrice } from '../api/prices.js';
import { getMarkets } from '../api/markets.js';
import { formatSupply, formatDate } from '../utils/format.js';

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

const PRICE_UNAVAILABLE = 'Price unavailable. (Not found in cache)';

//cheapest market found for the sticker - no wear tiers/variants here, just one price per market.
//each market's value is {price, link}
function lowestPrice(prices) {
    if (!prices) return PRICE_UNAVAILABLE;
    const values = Object.values(prices);
    if (!values.length) return PRICE_UNAVAILABLE;
    return `From $${Math.min(...values.map(v => v.price)).toFixed(2)}`;
}

//total supply is only ever populated for weapon skins (confirmed empirically - every other CS2Cap item type
//returns null for it), release date is populated much more broadly - each renders only when actually present
function renderDetailStats(item) {
    const stats = [
        item.totalSupply != null ? { label: 'Total Supply', value: formatSupply(item.totalSupply) } : null,
        item.releaseDate ? { label: 'Release Date', value: formatDate(item.releaseDate) } : null,
    ].filter(Boolean);
    if (!stats.length) return '';

    return `
    <div class="detail-stats">
        ${stats.map(s => `
        <div class="detail-stat-item">
            <span class="detail-stat-label">${s.label}</span>
            <span class="detail-stat-value">${s.value}</span>
        </div>`).join('')}
    </div>`;
}

function renderCrates(item) {
    if (!item.crates?.length) return '';
    return `
    <div class="detail-crates">
        <span class="detail-stat-label">Found In</span>
        <div class="detail-crates-row">
            ${item.crates.map(crate => `
            <span class="detail-crate-chip">
                ${crate.image ? `<img src="${crate.image}" alt="${crate.name}">` : ''}
                ${crate.name}
            </span>`).join('')}
        </div>
    </div>`;
}

//one pill per market that actually has a price for this item - logo + price, cheapest first.
//each pill links straight to that market's listing when CS2Cap gave us one (not every provider has a link)
function renderMarketListings(prices, markets) {
    if (!prices) return '';
    const entries = Object.entries(prices).sort((a, b) => a[1].price - b[1].price);
    if (!entries.length) return '';

    return `
    <div class="market-listings">
        ${entries.map(([key, data]) => {
            const logo = markets[key]?.logo;
            const inner = `${logo ? `<img src="${logo}" alt="${key}">` : ''}$${data.price.toFixed(2)}`;
            return data.link
                ? `<a class="market-pill" href="${data.link}" target="_blank" rel="noopener">${inner}</a>`
                : `<span class="market-pill">${inner}</span>`;
        }).join('')}
    </div>`;
}

//renders the page for one specific sticker, routed to as "#/sticker/<id>" - id is stickers.json's own CS2Cap
//item id; explore.js resolves capsule-contents clicks to this same id via a name lookup before navigating here
export function renderStickerDetail(param) {
    const app = document.getElementById('app');

    app.innerHTML = `
        <div class="skin-detail-page">
            <p class="explore-loading">Loading…</p>
        </div>
    `;

    return Promise.all([getStickers(), getItemPrice(param), getMarkets()]).then(([stickers, prices, markets]) => {
        const container = document.querySelector('.skin-detail-page');
        if (!container) return;

        const s = stickers.find(item => item.id === param);

        if (!s) {
            container.innerHTML = `
                <button class="explore-back" onclick="window.history.back()">← Back</button>
                <p class="explore-empty">Sticker not found.</p>`;
            return;
        }

        const csfloatLink = `https://csfloat.com/search?type=buy_now&sticker_index=${s.defIndex}`;

        container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <div class="skin-detail-layout">
                <div class="skin-detail-media">
                    <div class="skin-detail-art" style="background: ${rarityGradient(s.rarity.color)}">
                        <span class="skin-rarity">${s.rarity.name}</span>
                        ${s.image ? `<img class="skin-detail-img" src="${s.image}" alt="${s.name}">` : '<div class="skin-img-placeholder"></div>'}
                    </div>
                    ${renderMarketListings(prices, markets)}
                </div>
                <div class="skin-detail-info">
                    <h1 class="skin-detail-name">${s.name}</h1>
                    ${s.description ? `<p class="skin-detail-desc">${s.description.replace(/\\n/g, '<br><br>')}</p>` : ''}
                    ${renderDetailStats(s)}
                    <p class="skin-detail-desc">${lowestPrice(prices)}</p>
                    <a class="csfloat-link" href="${csfloatLink}" target="_blank" rel="noopener">View on CSFloat</a>
                    ${renderCrates(s)}
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
