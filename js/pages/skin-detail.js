import { getPrices } from '../api/prices.js';
import { getSkinByIndex } from '../api/skins.js';
import { getMarkets } from '../api/markets.js';
import { wearTiersFor } from '../utils/wear-tiers.js';
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

const VARIANT_LABELS = { normal: 'Normal', stattrak: 'StatTrak™' };

//cheapest market for each wear-tier/variant cell - keeps which market it came from too (not just the price),
//so the table can show that market's logo next to the number
function priceGrid(prices) {
    const grid = {};
    for (const [tier, variants] of Object.entries(prices)) {
        grid[tier] = {};
        for (const [variant, markets] of Object.entries(variants)) {
            const entries = Object.entries(markets);
            grid[tier][variant] = entries.length
                ? entries.reduce((min, e) => e[1] < min[1] ? e : min)
                : null;
        }
    }
    return grid;
}

function renderPriceGrid(s, prices, markets) {
    if (!prices) return '<p class="skin-detail-desc">Prices Unavailable. (Not found in cache)</p>';

    const grid = priceGrid(prices);
    const tiers = wearTiersFor(s);
    const variants = ['normal', ...(s.stattrak ? ['stattrak'] : [])];
    const cols = `1.1fr repeat(${variants.length}, 1fr)`; //CSS defaults to 3 price columns (normal/stattrak/souvenir); overridden here since souvenir pricing isn't fetched

    const headerRow = `
    <div class="skin-price-row skin-price-row--header" style="grid-template-columns: ${cols}">
        <span></span>
        ${variants.map(v => `<span class="skin-price-col">${VARIANT_LABELS[v]}</span>`).join('')}
    </div>`;

    const rows = tiers.map(tier => `
    <div class="skin-price-row" style="grid-template-columns: ${cols}">
        <span class="skin-price-tier">${tier.label}</span>
        ${variants.map(v => {
            const cell = grid[tier.key]?.[v];
            const stattrakClass = v === 'stattrak' ? ' skin-price-col--stattrak' : '';
            if (!cell) return `<span class="skin-price-col${stattrakClass}">—</span>`;
            const [market, price] = cell;
            const logo = markets[market]?.logo;
            return `<span class="skin-price-col${stattrakClass}">${logo ? `<img class="skin-price-col-logo" src="${logo}" alt="${market}">` : ''}$${price.toFixed(2)}</span>`;
        }).join('')}
    </div>`).join('');

    return `<div class="skin-price-table">${headerRow}${rows}</div>`;
}

//FT is the most commonly-traded tier, so it's preferred as "the" price to show for a skin; falls back down
//the list for skins that don't span FT (e.g. most knives only run Factory New - Minimal Wear). Same fallback
//order the old (deleted) cs2cap.js used for its single representative-cell fetch. Normal variant only.
const TIER_PRIORITY = ['FT', 'FN', 'MW', 'WW', 'BS'];

function representativeTierPrices(prices) {
    for (const key of TIER_PRIORITY) {
        const cell = prices[key]?.normal;
        if (cell && Object.keys(cell).length) return cell;
    }
    return null;
}

//one pill per market that actually has a price for this item - logo + price, cheapest first
function renderMarketListings(prices, markets) {
    if (!prices) return '';
    const entries = Object.entries(prices).sort((a, b) => a[1] - b[1]);
    if (!entries.length) return '';

    return `
    <div class="market-listings">
        ${entries.map(([key, price]) => `
        <span class="market-pill">
            ${markets[key]?.logo ? `<img src="${markets[key].logo}" alt="${key}">` : ''}
            $${price.toFixed(2)}
        </span>`).join('')}
    </div>`;
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

//pill row of every crate/capsule this item can drop from - hidden entirely for items with no crate association
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

//renders the page for one specific skin, routed to as "#/skin/<defIndex>-<paintIndex>" since that pair is the only unique id skins.json gives us
export function renderSkinDetail(param) {
    const app = document.getElementById('app');
    const [defIndex, paintIndex] = (param || '').split('-').map(Number);

    app.innerHTML = `
        <div class="skin-detail-page">
            <p class="explore-loading">Loading…</p>
        </div>
    `;

    return Promise.all([getSkinByIndex(defIndex, paintIndex), getPrices(defIndex, paintIndex), getMarkets()]).then(([s, prices, markets]) => {
        const container = document.querySelector('.skin-detail-page');
        if (!container) return;

        if (!s) {
            container.innerHTML = `
                <button class="explore-back" onclick="window.history.back()">← Back</button>
                <p class="explore-empty">Skin not found.</p>`;
            return;
        }
        const repPrices = prices ? representativeTierPrices(prices) : null;
        container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <div class="skin-detail-layout">
                <div class="skin-detail-media">
                    <div class="skin-detail-art" style="background: ${rarityGradient(s.rarity.color)}">
                        <span class="skin-rarity">${s.rarity.name}</span>
                        ${s.image ? `<img class="skin-detail-img" src="${s.image}" alt="${s.weapon} | ${s.name}">` : '<div class="skin-img-placeholder"></div>'}
                    </div>
                    ${renderMarketListings(repPrices, markets)}
                </div>
                <div class="skin-detail-info">
                    <span class="skin-weapon">${s.category === "Knives" || s.category === "Gloves" ? `★ ${s.weapon}` : s.weapon}</span>
                    <h1 class="skin-detail-name">${s.name ?? ''}${s.phase ? ` | ${s.phase}` : ''}</h1>

                    ${s.minFloat != null ? `
                    <div class="wear-bar" data-tooltip="Float range: ${s.minFloat} – ${s.maxFloat}">
                        <span class="wear-bar-marker" style="left: ${s.minFloat * 100}%"></span>
                        <span class="wear-bar-marker" style="left: ${s.maxFloat * 100}%"></span>
                    </div>` : ''}

                    <div class="skin-badges">
                        <span class="skin-badge skin-badge--normal">Normal</span>
                        ${s.stattrak ? '<span class="skin-badge skin-badge--stattrak">StatTrak™</span>' : ''}
                        ${s.souvenir ? '<span class="skin-badge skin-badge--souvenir">Souvenir</span>' : ''}
                    </div>

                    ${s.description ? `<p class="skin-detail-desc">${s.description.replace(/\\n/g, '<br><br>')}</p>` : ''}
                    ${renderDetailStats(s)}
                    ${renderPriceGrid(s, prices, markets)}
                    <a class="csfloat-link" href="https://csfloat.com/search?type=buy_now&def_index=${s.defIndex}&paint_index=${s.paintIndex}" target="_blank" rel="noopener">View on CSFloat</a>
                    ${renderCrates(s)}
                    </div>
            </div>
        `;
    }).catch(() => {
        const container = document.querySelector('.skin-detail-page');
        if (container) container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <p class="explore-empty">Failed to load skin.</p>`;
    });
}
