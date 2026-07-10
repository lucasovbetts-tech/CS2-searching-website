import { getSkinByIndex } from '../api/skins.js';
import { getPrices } from '../api/prices.js'
import { wearTiersFor } from '../utils/wear-tiers.js';

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

//each cell in `prices` (from getPrices) is a map of marketplace -> price, e.g. {csfloat: 28.81, csmoney: 30.64};
//we show the lowest of whatever markets actually had data. prices is null while loading, {} once resolved with nothing found
function lowestPrice(marketPrices) {
    if (!marketPrices) return null;
    const values = Object.values(marketPrices);
    return values.length ? Math.min(...values) : null;
}

function renderPriceTable(s, prices) {
    const tiers = wearTiersFor(s);
    const fmt = v => v == null ? (prices ? 'N/A' : '…') : `£${v.toFixed(2)}`;

    return `
    <div class="skin-price-table">
        <div class="skin-price-row skin-price-row--header">
            <span class="skin-price-tier"></span>
            <span class="skin-price-col">Normal</span>
            ${s.stattrak ? '<span class="skin-price-col skin-price-col--stattrak">StatTrak™</span>' : ''}
            ${s.souvenir ? '<span class="skin-price-col skin-price-col--souvenir">Souvenir</span>' : ''}
        </div>
        ${tiers.map(t => {
            const cell = prices?.[t.key];
            return `
        <div class="skin-price-row">
            <span class="skin-price-tier">${t.label}</span>
            <span class="skin-price-col">${fmt(lowestPrice(cell?.normal))}</span>
            ${s.stattrak ? `<span class="skin-price-col skin-price-col--stattrak">${fmt(lowestPrice(cell?.stattrak))}</span>` : ''}
            ${s.souvenir ? `<span class="skin-price-col skin-price-col--souvenir">Unavailable</span>` : ''}
        </div>`;
        }).join('')}
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

    return getSkinByIndex(defIndex, paintIndex).then(s => {
        const container = document.querySelector('.skin-detail-page');
        if (!container) return;

        if (!s) {
            container.innerHTML = `
                <button class="explore-back" onclick="window.history.back()">← Back</button>
                <p class="explore-empty">Skin not found.</p>`;
            return;
        }
        container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <div class="skin-detail-layout">
                <div class="skin-detail-art" style="background: ${rarityGradient(s.rarity.color)}">
                    <span class="skin-rarity">${s.rarity.name}</span>
                    ${s.image ? `<img class="skin-detail-img" src="${s.image}" alt="${s.weapon} | ${s.name}">` : '<div class="skin-img-placeholder"></div>'}
                </div>
                <div class="skin-detail-info">
                    <span class="skin-weapon">${s.category === "Knives" || s.category === "Gloves" ? `★ ${s.weapon}` : s.weapon}</span>
                    <h1 class="skin-detail-name">${s.name}${s.phase ? ` | ${s.phase}` : ''}</h1>

                    ${s.minFloat !== undefined ? `
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

                    ${renderPriceTable(s, null)}

                    <a class="csfloat-link" href="https://csfloat.com/search?def_index=${s.defIndex}&paint_index=${s.paintIndex}" target="_blank" rel="noopener">View on CSFloat</a>
                </div>
            </div>
        `;

        //fetch happens after the page is already rendered so the price table starts as a loading
        //state ("…") and gets swapped in-place once real prices resolve, instead of blocking the whole page
        getPrices(defIndex, paintIndex).then(prices => {
            const priceTable = document.querySelector('.skin-price-table');
            if (priceTable) priceTable.outerHTML = renderPriceTable(s, prices);
        }).catch(() => {
            const priceTable = document.querySelector('.skin-price-table');
            if (priceTable) priceTable.outerHTML = renderPriceTable(s, {});
        });
    }).catch(() => {
        const container = document.querySelector('.skin-detail-page');
        if (container) container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <p class="explore-empty">Failed to load skin.</p>`;
    });
}
