import { getSkins } from '../api/skins.js'
import { getCollections } from '../api/collections.js';
import { getCases } from '../api/crates.js';
import { getPrices } from '../api/prices.js';
import { priceSpan, applyPrice, toUsd } from '../utils/currency.js';
import { WEAR_TIERS, wearTiersFor } from '../utils/wear-tiers.js';
import {
    computeGoldOutcomes, computeStandardOutcomes, parseRareItemName,
    TradeUpValidationError, GOLD_INPUT_COUNT, STANDARD_INPUT_COUNT, assertOutcomesSumToOne,
} from '../utils/tradeup-probability.js';


const RARITY_RANK = {
    'Covert': 1,
    'Classified': 2,
    'Restricted': 3,
    'Mil-Spec Grade': 4,
    'Industrial Grade': 5,
    'Consumer Grade': 6,
};
const GOLD_RANK = 0;
const BATCH_SIZE = 50;

//same breakpoints WEAR_TIERS already defines (0.07/0.15/0.38/0.45) - reused instead of a second copy so this can't
//drift out of sync, and so the returned key ('FN'/'MW'/...) matches exactly what getPrices()'s data is keyed by
function tierKeyForFloat(float) {
    return (WEAR_TIERS.find(t => float < t.max) || WEAR_TIERS[WEAR_TIERS.length - 1]).key;
}

//cheapest market for a given wear-tier/variant cell - same "cheapest across providers" approach skin-detail.js
//uses (its priceGrid()), just for a single cell instead of the whole grid. Returns just the number, not {market, data}
function cheapestPrice(prices, tierKey, variant = 'normal') {
    const markets = prices?.[tierKey]?.[variant];
    if (!markets) return null;
    const entries = Object.values(markets);
    return entries.length ? Math.min(...entries.map(m => m.price)) : null;
}

//low/high across only the wear tiers this specific skin can actually reach (wearTiersFor) - a skin capped at
//maxFloat 0.08 (many knives) should never show a Battle-Scarred price it can't actually produce. Either side can
//come back null if none of the reachable tiers have price data at all.
function priceRangeFor(skin, prices, variant = 'normal') {
    const tierPrices = wearTiersFor(skin).map(t => cheapestPrice(prices, t.key, variant)).filter(p => p !== null);
    return tierPrices.length ? { low: Math.min(...tierPrices), high: Math.max(...tierPrices) } : { low: null, high: null };
}

//reads the Category field straight off the DOM (same pattern as rarity/collection elsewhere in this file) rather
//than tracking a separate variable, so it can never drift out of sync with what's actually selected
function currentCategory() {
    return document.querySelector('#tfCategory .custom-select-opt.active')?.dataset.value || 'Normal';
}

//real CS2 trade-up float formula: average how "worn" the 10 inputs are, each relative to its OWN float range
//(0 = pristine, 1 = maximally worn, independent of which skins they actually are), then average those 10 fractions
function averageInputFraction(inputs) {
    const sum = inputs.reduce((total, { float, minFloat, maxFloat }) =>
        total + (float - minFloat) / (maxFloat - minFloat), 0);
    return sum / inputs.length;
}

//maps that average fraction onto a specific output skin's own float range
function calculateOutcomeFloat(inputs, outputMinFloat, outputMaxFloat) {
    const fraction = averageInputFraction(inputs);
    return outputMinFloat + fraction * (outputMaxFloat - outputMinFloat);
}

document.addEventListener('click', e => {
    if (e.target.closest('.tf-field--select')) return;
    document.querySelectorAll('.tradeup-toolbar .tf-field--select.open, .tradeup-toolbar .custom-select-list.open, .tradeup-toolbar .tf-select-btn.open')
        .forEach(el => el.classList.remove('open'));
});

//closes any open custom-price popup when the click lands outside both the popup itself and the edit button that
//opens it - those two are excluded so opening/interacting with the popup doesn't immediately close itself
document.addEventListener('click', e => {
    if (e.target.closest('.tradeup-price-popup') || e.target.closest('.tradeup-edit-btn')) return;
    document.querySelectorAll('.tradeup-price-popup.open').forEach(p => p.classList.remove('open'));
});


function darken(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function rarityGradient(hex) {
    return `radial-gradient(ellipse at 50% 35%, ${hex} 0%, ${darken(hex, 0.6)} 55%, ${darken(hex, 0.1)} 100%)`;
}

//one toolbar dropdown field - same custom-select look as the header's locale/currency pickers, not the browser's native <select> popup.
//searchable fields (lots of options, e.g. Collection) also get a hidden search input that replaces the button while open
function renderDropdownField(id, label, options, searchable = false) {
    const opts = options.map((opt, i) =>
        `<button class="custom-select-opt${i === 0 ? ' active' : ''}" data-value="${opt}" type="button">${opt}</button>`
    ).join('');
    return `
    <div class="tf-field tf-field--select" id="${id}">
        <label class="tf-label">${label}:</label>
        <button class="tf-select-btn" type="button">
            <span class="tf-select-val">${options[0]}</span>
            <svg class="select-chevron" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
        ${searchable ? `<input class="tf-select-search" type="text" placeholder="Search ${label.toLowerCase()}..." autocomplete="off">` : ''}
        <div class="custom-select-list">${opts}</div>
    </div>`;
}

//opens/closes one dropdown field and shows the clicked option. onSelect is optional - only fields that need to
//actually affect what's shown (like Rarity) pass one; the rest stay purely visual. searchable swaps the button for a
//live-filtering text input while the field is open (only worth it for fields with lots of options, like Collection)
function wireDropdown(fieldEl, onSelect, searchable = false) {
    if (!fieldEl) return;
    const btn = fieldEl.querySelector('.tf-select-btn');
    const val = fieldEl.querySelector('.tf-select-val');
    const list = fieldEl.querySelector('.custom-select-list');
    const search = fieldEl.querySelector('.tf-select-search');

    function openList() {
        document.querySelectorAll('.tradeup-toolbar .tf-field--select.open').forEach(f => {
            if (f !== fieldEl) f.classList.remove('open');
        });
        document.querySelectorAll('.tradeup-toolbar .custom-select-list.open').forEach(l => {
            if (l !== list) l.classList.remove('open');
        });
        list.classList.add('open');
        btn.classList.add('open');
        fieldEl.classList.add('open');
        if (search) {
            search.value = '';
            list.querySelectorAll('.custom-select-opt').forEach(o => o.style.display = ''); //clear any filter from last time it was open
            search.focus();
        }
    }

    function closeList() {
        list.classList.remove('open');
        btn.classList.remove('open');
        fieldEl.classList.remove('open');
    }

    //listens on the whole field, not just the button, so clicking anywhere in the box (padding included) opens it
    fieldEl.addEventListener('click', e => {
        if (e.target.closest('.custom-select-opt')) return; //handled separately below
        if (e.target === search) return; //typing/clicking in the search box shouldn't toggle the dropdown closed
        e.stopPropagation();
        list.classList.contains('open') ? closeList() : openList();
    });

    list.addEventListener('click', e => {
        const opt = e.target.closest('.custom-select-opt');
        if (!opt) return;
        list.querySelectorAll('.custom-select-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        val.textContent = opt.textContent;
        closeList();
        onSelect?.(opt.dataset.value);
    });

    if (search) {
        search.addEventListener('click', e => e.stopPropagation());
        search.addEventListener('input', e => {
            const query = e.target.value.trim().toLowerCase();
            list.querySelectorAll('.custom-select-opt').forEach(o => {
                o.style.display = o.textContent.toLowerCase().includes(query) ? '' : 'none';
            });
        });
    }
}


//one tradeupable skin's card - same shape as explore.js's skin-card, plus the collection's own image next to a shortened wear-bar
function renderTradeupCard(skin, collection, collectionImage) {
    const stattrakSuffix = currentCategory() === 'StatTrak' ? ' <sup class="stattrak-badge">StatTrak™</sup>' : '';
    return `
    <div class="skin-card tradeup-card" data-weapon="${skin.weapon}" data-name="${skin.name}" data-rarity="${skin.rarity.name}" style="background: ${rarityGradient(skin.rarity.color)}">
        <div class="tradeup-price-row">
            <span class="tradeup-price-pill tradeup-price-low">…</span>
            <span class="tradeup-price-sep">–</span>
            <span class="tradeup-price-pill tradeup-price-high">…</span>
        </div>
        ${skin.image ? `<img class="skin-img" src="${skin.image}" alt="${skin.weapon} | ${skin.name}">` : '<div class="skin-img-placeholder"></div>'}
        <div class="tradeup-meta-row">
            <span class="tradeup-collection-wrap" data-tooltip="${collection}">
                ${collectionImage ? `<img class="tradeup-collection-img" src="${collectionImage}" alt="${collection}">` : '<span class="tradeup-collection-img tradeup-collection-img--empty"></span>'}
            </span>
            <div class="tradeup-wear-bar" data-tooltip="Float range: ${skin.minFloat} – ${skin.maxFloat}">
                <span class="tradeup-wear-marker" style="left: ${skin.minFloat * 100}%"></span>
                <span class="tradeup-wear-marker" style="left: ${skin.maxFloat * 100}%"></span>
            </div>
        </div>
        <div class="tradeup-name-col">
            <span class="skin-weapon">${skin.weapon}</span>
            <p class="skin-name">${skin.name}${stattrakSuffix}</p>
        </div>
    </div>`;
}

//purely decorative, represents how many slots need to be filled for a tradeup to work
function renderTradeupSlotPlaceholder() {
    return `
    <div class="skin-card tradeup-slot-placeholder">
        <div class="tradeup-price-row">
            <span class="tradeup-price-pill">&nbsp;</span>
        </div>
        <div class="skin-img-placeholder"></div>
        <div class="tradeup-meta-row">
            <span class="tradeup-collection-wrap">
                <span class="tradeup-collection-img tradeup-collection-img--empty"></span>
            </span>
            <div class="tradeup-wear-bar"></div>
        </div>
        <div class="tradeup-name-col">
            <span class="skin-weapon">&nbsp;</span>
            <p class="skin-name">&nbsp;</p>
        </div>
        <input class="tradeup-float-input" disabled>
        <div class="tradeup-card-actions">
            <span class="tradeup-card-btn"></span>
            <span class="tradeup-card-btn"></span>
            <span class="tradeup-card-btn"></span>
        </div>
        <div class="tradeup-slot-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8M8 12h8" />
            </svg>
        </div>
    </div>`;
}

function renderTradeupRight(weapon, name, skins, float = null, priceData = null) {
    const rightGrid = document.getElementById('tradeup-right');
    const { skin, collection, collectionImage } = skins.find(s => s.skin.weapon === weapon && s.skin.name === name);
    //0.035 isn't valid for every skin (some have a minFloat above it, or a maxFloat below it) - can't be a fixed
    //default parameter value since skin isn't resolved yet at that point. Falls back to this specific skin's own
    //minFloat + 0.02 instead, which is always a guaranteed-valid float for it
    if (float === null) float = (skin.minFloat + 0.02).toFixed(5);
    const stattrakSuffix = currentCategory() === 'StatTrak' ? ' <sup class="stattrak-badge">StatTrak™</sup>' : '';
    const cardHTML = `
        <div class="skin-card tradeup-card-right" data-weapon="${skin.weapon}" data-name="${skin.name}" data-rarity="${skin.rarity.name}" data-collection="${collection}" style="background: ${rarityGradient(skin.rarity.color)}">
            <div class="tradeup-price-row">
                <span class="tradeup-price-pill">…</span>
            </div>
                <div class="tradeup-price-popup">
                    <label class="tf-label">Custom Price:</label>
                    <input class="tradeup-price-popup-input" type="number" min="0" step="0.01" placeholder="Enter price">
                </div>
            ${skin.image ? `<img class="skin-img" src="${skin.image}" alt="${skin.weapon} | ${skin.name}">` : '<div class="skin-img-placeholder"></div>'}
            <div class="tradeup-meta-row">
                <span class="tradeup-collection-wrap" data-tooltip="${collection}">
                    ${collectionImage ? `<img class="tradeup-collection-img" src="${collectionImage}" alt="${collection}">` : '<span class="tradeup-collection-img tradeup-collection-img--empty"></span>'}
                </span>
                <div class="tradeup-wear-bar" data-tooltip="Float range: ${skin.minFloat} – ${skin.maxFloat}">
                    <span class="tradeup-wear-marker" style="left: ${skin.minFloat * 100}%"></span>
                    <span class="tradeup-wear-marker" style="left: ${skin.maxFloat * 100}%"></span>
                </div>
            </div>
            <div class="tradeup-name-col">
                <span class="skin-weapon">${skin.weapon}</span>
                <p class="skin-name">${skin.name}${stattrakSuffix}</p>
            </div>
            <input class="tradeup-float-input" type="number" min="0" max="1" step="0.001" value="${float}">
            <div class="tradeup-card-actions">
                <button class="tradeup-card-btn tradeup-edit-btn" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-receipt-2"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2" /><path d="M14 8h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5m2 0v1.5m0 -9v1.5" /></svg>
                </button>
                <button class="tradeup-card-btn tradeup-copy-btn" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-copy">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" />
                        <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
                    </svg>
                </button>
                <button class="tradeup-card-btn tradeup-delete-btn" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-trash">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M4 7l16 0" />
                        <path d="M10 11l0 6" />
                        <path d="M14 11l0 6" />
                        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                    </svg>
                </button>
            </div>
        </div>`;

    const slot = rightGrid.querySelector('.tradeup-slot-placeholder');
    let cardEl;
    if (slot) {
        slot.insertAdjacentHTML('beforebegin', cardHTML);
        cardEl = slot.previousElementSibling;
        slot.remove();
    } else {
        rightGrid.insertAdjacentHTML('beforeend', cardHTML);
        cardEl = rightGrid.lastElementChild;
    }

    //tapes the already-found skin onto the card so renderSkinOutcomes() (runs on every keystroke/add/delete/copy) can
    //reuse it directly instead of re-running skins.find() across the whole catalog every time
    cardEl._skin = skin;
    const applyPrices = prices => {
        cardEl._prices = prices;
        const variant = currentCategory() === 'StatTrak' ? 'stattrak' : 'normal';
        const value = cheapestPrice(prices, tierKeyForFloat(float), variant);
        applyPrice(cardEl.querySelector('.tradeup-price-pill'), value);
        const rightGridEl = document.getElementById('tradeup-right');
        const limit = skin.rarity.name === 'Covert' ? 5 : 10;
        if (rightGridEl.querySelectorAll('.tradeup-card-right').length === limit) updateOutcomes();
    };

    if (priceData) {
        applyPrices(priceData);
    } else {
        getPrices(skin.defIndex, skin.paintIndex).then(applyPrices);
    }
}

//Category changed while cards already sit in the right panel - patches each one's name/price in place rather than
//re-adding them, reusing the prices each card already fetched (cardEl._prices) instead of re-fetching from cache.
function updateRightPanelForCategory() {
    const isStatTrak = currentCategory() === 'StatTrak';
    const variant = isStatTrak ? 'stattrak' : 'normal';
    document.querySelectorAll('#tradeup-right .tradeup-card-right').forEach(cardEl => {
        const skin = cardEl._skin;
        if (!skin) return;

        const nameEl = cardEl.querySelector('.skin-name');
        if (nameEl) nameEl.innerHTML = `${skin.name}${isStatTrak ? ' <sup class="stattrak-badge">StatTrak™</sup>' : ''}`; //innerHTML, not textContent - <sup> needs to render as an element, not literal text

        const float = parseFloat(cardEl.querySelector('.tradeup-float-input')?.value) || 0;
        const value = cheapestPrice(cardEl._prices, tierKeyForFloat(float), variant);
        applyPrice(cardEl.querySelector('.tradeup-price-pill'), value);
    });
    updateOutcomes(); //cost (and everything derived from it) needs recalculating against the new prices
}

function editPrice(card) {
    const popup = card.querySelector('.tradeup-price-popup');
    document.querySelectorAll('.tradeup-price-popup.open').forEach(p => {
        if (p !== popup) p.classList.remove('open');
    });
    
    popup.classList.toggle('open');
}

async function updateOutcomes(collections, cases, skins) {
    if (!collections || !cases || !skins) {
        [collections, cases, skins] = await Promise.all([getCollections(), getCases(), getSkins()]);
    }

    const rightGrid = document.getElementById('tradeup-right');
    const cards = [...rightGrid.querySelectorAll('.tradeup-card-right')];

    const total = cards
        .map(card => card.querySelector('.tradeup-price-pill'))
        .reduce((sum, pill) => sum + (parseFloat(pill.dataset.usd) || 0), 0);

    const possibleOutcomes = await renderSkinOutcomes(collections, cases, skins, total);

    //reads straight off the rendered outcome cards (raw usd + probability text), same DOM-reading approach as
    //`total` above, rather than the raw possibleOutcomes data - keeps this in sync with whatever's actually on screen
    const profitChance = [...document.querySelectorAll('.tradeup-outcome-card')]
        .map(card => ({
            price: parseFloat(card.querySelector('.tradeup-outcome-price [data-usd]')?.dataset.usd) || 0,
            probability: parseFloat(card.querySelector('.probability-per-skin').textContent.replace('%', '')) || 0,
        }))
        .filter(({ price }) => price > total)
        .reduce((sum, { probability }) => sum + probability, 0).toFixed(2);

    let averageFloat = 0;
    if (possibleOutcomes.length) {
        const floatSum = possibleOutcomes.reduce((sum, skin) => sum + skin.outputFloat, 0);
        averageFloat = (floatSum / possibleOutcomes.length).toFixed(5);
    }

    //profit/loss only makes sense against outcomes that actually got a real price back
    const pricedOutcomes = possibleOutcomes.filter(skin => skin.price !== null);
    let maxProfit = 0;
    let maxLoss = 0;
    if (pricedOutcomes.length) {
        const prices = pricedOutcomes.map(skin => skin.price);
        maxProfit = Math.max(...prices) - total;
        maxLoss = Math.min(...prices) - total;
    }

    const expectedValue = pricedOutcomes.reduce((sum, skin) => sum + (skin.probability ?? 0) * skin.price, 0);
    const profitability = total > 0 ? (expectedValue / total * 100).toFixed(2) : 0;
    const averageProfit = expectedValue - total;

    document.getElementById('tradeup-outcomes').outerHTML = outcomes({ cost: total, averageFloat, profitChance, profitability, averageProfit, maxProfit, maxLoss });
}

function outcomes({ averageFloat = 0, cost = 0, profitChance = 0, profitability = 0, averageProfit = 0, maxProfit = 0, maxLoss = 0 } = {}) {
    const profitabilityClass = profitability < 100 ? 'tradeup-outcome-value--negative' : 'tradeup-outcome-value--positive';
    const averageProfitClass = averageProfit < 0 ? 'tradeup-outcome-value--negative' : 'tradeup-outcome-value--positive';
    return `
    <div class="tradeup-outcomes" id="tradeup-outcomes">
        <h2 class="tradeup-outcomes-title">Outcomes</h2>
        <div class="tradeup-outcomes-stats">
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Avg Adjusted Float</span>
                <span class="tradeup-outcome-value">${averageFloat}</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Cost</span>
                <span class="tradeup-outcome-value" id="tradeup-outcome-value">${priceSpan(cost)}</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Profit Chances</span>
                <span class="tradeup-outcome-value">${profitChance}%</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Profitability</span>
                <span class="tradeup-outcome-value ${profitabilityClass}">${profitability}%</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Average Profit</span>
                <span class="tradeup-outcome-value ${averageProfitClass}">${priceSpan(averageProfit)}</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Max Profit</span>
                <span class="tradeup-outcome-value tradeup-outcome-value--positive">${priceSpan(maxProfit)}</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Max Loss</span>
                <span class="tradeup-outcome-value tradeup-outcome-value--negative">${priceSpan(maxLoss)}</span>
            </div>
        </div>
    </div>`;
}

async function renderSkinOutcomes(collections, cases, skins, total) {
    const rightGrid = document.getElementById('tradeup-right');
    const gridRarity = rightGrid.querySelector('.tradeup-card-right')?.dataset.rarity;
    if (!gridRarity) {
        document.getElementById('tradeupPossibleOutcomes').innerHTML = ''; //nothing selected - clear any leftover preview from before
        return [];
    }

    const targetRank = RARITY_RANK[gridRarity] - 1; //one rank better than whatever's currently selected - the only rarity a real trade-up of these inputs could actually produce

    const collectionNames = new Set([...rightGrid.querySelectorAll('.tradeup-card-right')].map(c => c.dataset.collection));
    const skinOutcomeARR = [...collectionNames].flatMap(cN => {
        const colMatch = collections.find(c => c.name === cN);
        if (!colMatch) return []; //guards against a name that somehow doesn't match anything

        let goldARR = [];
        if (colMatch.crates.length > 0) {
            const linkedCaseIds = colMatch.crates.map(crate => crate.id);
            const matchedCase = cases.find(cs => linkedCaseIds.includes(cs.id));
            goldARR = matchedCase?.contains_rare ?? [];
        }

        const normalRanked = colMatch.contains.map(skin => ({ skin, rank: RARITY_RANK[skin.rarity.name], collection: colMatch.name, collectionImage: colMatch.image }));
        const goldRanked = goldARR.map(skin => ({ skin, rank: GOLD_RANK, collection: colMatch.name, collectionImage: colMatch.image }));

        return [...normalRanked, ...goldRanked];
    });

    const inputs = [...rightGrid.querySelectorAll('.tradeup-card-right')].map(card => ({
        float: parseFloat(card.querySelector('.tradeup-float-input').value) || 0,
        minFloat: card._skin.minFloat,
        maxFloat: card._skin.maxFloat,
    }));

    const rankFiltered = skinOutcomeARR.filter(entry => entry.rank === targetRank);

    const filteredOutcomes = rankFiltered.map(entry => {
        const [weapon, name] = entry.skin.name.replace(/^★\s*/, '').split('|').map(s => s.trim());
        //contains_rare entries for a phased finish (Doppler/Gamma Doppler) share the same `name` across all
        //phases, so phase is matched too to resolve each entry to its own correct skins.json row
        const fullSkin = skins.find(s => s.weapon === weapon && s.name === (name ?? null) && s.phase === (entry.skin.phase ?? null));
        const minFloat = fullSkin?.minFloat ?? 0;
        const maxFloat = fullSkin?.maxFloat ?? 1;
        const outputFloat = calculateOutcomeFloat(inputs, minFloat, maxFloat);
        return { ...entry.skin, minFloat, maxFloat, outputFloat, fullSkin, collection: entry.collection, collectionImage: entry.collectionImage };
    });


    const skinsProbability = await calculateOutcomeProbability(filteredOutcomes, collections, cases);

    //the picker already refuses to let a StatTrak contract include a Covert input whose collection's gold pool is
    //gloves (StatTrak gloves don't exist), so every outcome reachable here is safe to price with the same variant
    const isStatTrak = currentCategory() === 'StatTrak';
    const variant = isStatTrak ? 'stattrak' : 'normal';

    const pricedOutcomes = await Promise.all(skinsProbability.map(async ({ fullSkin, ...skin }) => {
        if (!fullSkin) return { ...skin, price: null };
        const prices = await getPrices(fullSkin.defIndex, fullSkin.paintIndex);
        const price = cheapestPrice(prices, tierKeyForFloat(skin.outputFloat), variant);
        return { ...skin, price };
    }));

    //most expensive first - null (?? -Infinity) sinks unpriced "N/A" cards to the bottom instead of NaN-ing the sort
    pricedOutcomes.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));

    const cardsHTML = pricedOutcomes.map(skin => {
        const outputFloat = skin.outputFloat.toFixed(5);
        const profit = skin.price !== null ? skin.price - total : null;
        const [weapon, name] = skin.name.split('|').map(n => n.trim());
        const cardClass = skin.price === null ? '' : skin.price > total ? 'tradeup-outcome-card--positive' : 'tradeup-outcome-card--negative';
        return `
        <div class="skin-card tradeup-outcome-card ${cardClass}">
            <div class="profit-per-skin">${profit !== null ? (profit > 0 ? '+' : '') + priceSpan(profit) : ''}</div>
            <div class="probability-per-skin">${formatProbability(skin.probability)}</div>
            ${skin.image ? `<img class="skin-img" src="${skin.image}" alt="${skin.name}">` : '<div class="skin-img-placeholder"></div>'}
            <div class="tradeup-meta-row">
                <span class="tradeup-collection-wrap" data-tooltip="${skin.collection}">
                    ${skin.collectionImage ? `<img class="tradeup-collection-img" src="${skin.collectionImage}" alt="${skin.collection}">` : '<span class="tradeup-collection-img tradeup-collection-img--empty"></span>'}
                </span>
                <div class="tradeup-wear-bar" data-tooltip="Float range: ${skin.minFloat} – ${skin.maxFloat}">
                    <span class="tradeup-wear-marker" style="left: ${skin.minFloat * 100}%"></span>
                    <span class="tradeup-wear-marker" style="left: ${skin.maxFloat * 100}%"></span>
                </div>
            </div>
            <div class="tradeup-name-col">
                <p class="tradeup-outcome-weapon">${weapon}</p>
                <p class="tradeup-outcome-skin">${name ?? ''}  ${skin.phase ? `- ${skin.phase}` : ''}${isStatTrak ? ' <sup class="stattrak-badge">StatTrak™</sup>' : ''}</p>
            </div>
            <p class="tradeup-outcome-float">${tierKeyForFloat(outputFloat)} - ${outputFloat}</p>
            <p class="tradeup-outcome-price">${priceSpan(skin.price)}</p>
        </div>`;
    });

    document.getElementById('tradeupPossibleOutcomes').innerHTML = cardsHTML.join('');
    return pricedOutcomes;
}

//Maps the engine's theoretical distribution onto the actual outcome cards being rendered.
//
//The matching is done by exact string key, so the engine's phase names (PHASE_WEIGHTS' keys: 'Phase 1'...
//'Phase 4', 'Ruby', 'Sapphire', 'Black Pearl', 'Emerald') have to line up exactly with whatever the outcome
//objects carry. A mismatch renders N/A and logs - deliberately, because a silently wrong probability on a
//trade-up calculator is worse than no probability at all.
 
const DEBUG_PROBABILITY = false; //flip on to assert the whole distribution sums to 1 on every recompute
 
function calculateOutcomeProbability(outcomes, collections, cases) {
    const rightGrid = document.getElementById('tradeup-right');
    const cards = [...rightGrid.querySelectorAll('.tradeup-card-right')];

    if (cards.length === 0) return outcomes;

    const isGoldTier = cards[0].dataset.rarity === 'Covert';
    const expectedCount = isGoldTier ? GOLD_INPUT_COUNT : STANDARD_INPUT_COUNT;
    if (cards.length !== expectedCount) return outcomes;
 
    const resolvedInputs = cards.map(card => {
        const collection = card.dataset.collection;
        const colMatch = collections.find(c => c.name === collection);

        const caseIds = isGoldTier
            ? (colMatch?.crates ?? []).filter(crate => cases.some(cs => cs.id === crate.id)).map(crate => crate.id)
            : [];
        return { collection, caseIds };
    });

    let probabilityByKey;
    try {
        if (isGoldTier) {
            const groups = new Map();
            for (const input of resolvedInputs) {
                const caseId = input.caseIds[0];
                if (!groups.has(caseId)) {
                    const rawContainsRare = (cases.find(cs => cs.id === caseId)?.contains_rare ?? []).map(r => r.name);
                    groups.set(caseId, { count: 0, rawContainsRare });
                }
                groups.get(caseId).count++;
            }
            const theoretical = computeGoldOutcomes(groups, resolvedInputs.length);
 
            if (DEBUG_PROBABILITY) assertOutcomesSumToOne(theoretical);
            probabilityByKey = new Map();
            for (const o of theoretical) {
                probabilityByKey.set(goldKey(o.model, o.finish, o.phase), o.probability);
            }
        } else {
            const groupCounts = new Map();
            for (const input of resolvedInputs) groupCounts.set(input.collection, (groupCounts.get(input.collection) ?? 0) + 1);
            const outputNamesByCollection = new Map();
            for (const outcome of outcomes) {
                if (!outputNamesByCollection.has(outcome.collection)) outputNamesByCollection.set(outcome.collection, []);
                outputNamesByCollection.get(outcome.collection).push(outcome.name);
            }
            const theoretical = computeStandardOutcomes(groupCounts, outputNamesByCollection, resolvedInputs.length);
 
            if (DEBUG_PROBABILITY) assertOutcomesSumToOne(theoretical);
 
            probabilityByKey = new Map(theoretical.map(o => [`${o.collection}|${o.outputName}`, o.probability]));
        }
    } catch (err) {
        if (!(err instanceof TradeUpValidationError)) throw err;
        console.warn('Trade-up probability unavailable:', err.message);
        return outcomes;
    }
 
    return outcomes.map(outcome => {
        let key;
        if (isGoldTier) {
            const { model, finish } = parseRareItemName(outcome.name);
            key = goldKey(model, finish, outcome.phase ?? null);
        } else {
            key = `${outcome.collection}|${outcome.name}`;
        }
 
        const probability = probabilityByKey.get(key);
 
        if (probability === undefined) {
            console.warn(`No probability matched for "${outcome.name}" (phase: ${outcome.phase ?? 'none'}) - key "${key}".`);
        }
        return { ...outcome, probability };
    });
}

function goldKey(model, finish, phase) {
    return phase ? `${model}|${finish}|${phase}` : `${model}|${finish}`;
}
 
//Render-time formatting, kept separate from the data so the probability field stays numeric.
function formatProbability(probability) {
    return probability === undefined ? 'N/A' : `${(probability * 100).toFixed(2)}%`;
}

export function renderTradeup() {
    document.getElementById('app').innerHTML = ` 
        <div class="tradeup-layout">
            <h1 class="tradeup-title">Select Skins for TradeUp</h1>
            <div class="tradeup-columns">
                <div class="tradeup-left">
                    <div class="tradeup-toolbar">
                        <div class="tf-field tf-field--search">
                            <label class="tf-label" for="tfSearch">Search:</label>
                            <input class="tf-input" id="tfSearch" type="text" placeholder="Enter skin name" autocomplete="off">
                        </div>
                        ${renderDropdownField('tfRarity', 'Rarity', ['All Rarities', 'Consumer Grade', 'Industrial Grade', 'Mil-Spec Grade', 'Restricted', 'Classified', 'Covert',])}
                        ${renderDropdownField('tfCollection', 'Collection', ['All Collections'], true)}
                        ${renderDropdownField('tfSort', 'Sort by', ['Cheapest', 'Most Expensive'])}
                        ${renderDropdownField('tfCategory', 'Category', ['Normal', 'StatTrak'])}
                    </div>
                    <div class="tradeup-grid" id="tradeupGrid">
                        <p class="explore-loading">Loading…</p>
                    </div>
                    <div id="tradeupSentinel"></div>
                </div>
                <div class="tradeup-divider"></div>
                <div class="tradeup-right-col">
                    <button class="tradeup-reset-btn" id="tradeupReset" type="button">Reset TradeUp</button>
                    <div class="tradeup-right" id="tradeup-right"></div>
                    ${outcomes()}
                    <div class="tradeup-possible-outcomes" id="tradeupPossibleOutcomes"></div>
                </div>
            </div>
        </div>
    `;
    return Promise.all([getSkins(), getCollections(), getCases(), getPrices()]).then(([skins, collections, cases]) => {
        const tradeUpData = collections.filter(c => c.name !== 'Limited Edition Item').map(c => {
            const linkedCaseIds = c.crates.map(crate => crate.id);
            const matchedCase = cases.find(cs => linkedCaseIds.includes(cs.id));
            const hasGold = !!matchedCase; 
            const goldIsGloves = hasGold && skins.find(s => s.weapon === parseRareItemName(matchedCase.contains_rare[0]?.name ?? '').model)?.category === 'Gloves';
            const parsed = c.contains.map(item => {
                const [weapon, skin] = item.name.split('|').map(s => s.trim());
                return { weapon, skin };
            });
            const matchedSkins = parsed.map(({ weapon, skin }) =>
                skins.find(n => n.name === skin && n.weapon === weapon)
            ).filter(Boolean);

            const ranksPresent = new Set(matchedSkins.map(s => RARITY_RANK[s.rarity.name]).filter(r => r !== undefined));
            if (hasGold) ranksPresent.add(GOLD_RANK);

            //only keep skins that can actually trade up: the next rank up needs to exist somewhere in this same collection
            const tradeupable = matchedSkins.filter(s => ranksPresent.has(RARITY_RANK[s.rarity.name] - 1));

            return { collection: c.name, collectionImage: c.image, hasGold, goldIsGloves, tradeupable };
        });

        const grid = document.getElementById('tradeupGrid');
        const sentinel = document.getElementById('tradeupSentinel');
        if (!grid) return;
        
        const allSkins = tradeUpData.flatMap(({ collection, collectionImage, goldIsGloves, tradeupable }) =>
            tradeupable.map(skin => ({ skin, collection, collectionImage, goldIsGloves })));
        if (!allSkins.length) {
            grid.innerHTML = '<p class="explore-empty">No tradeupable skins found.</p>';
            return;
        }

        grid.innerHTML = '';
        let rendered = 0;
        let currentPool = allSkins; //whatever's currently being paginated through - swapped to a filtered subset by applyFilters
        //===================RENDERING ONLY 50 SKINS AT A TIME TO REDUCE LAG ============================
        function renderNextBatch() {
            const next = currentPool.slice(rendered, rendered + BATCH_SIZE);
            const previousLength = grid.children.length;
            grid.insertAdjacentHTML('beforeend', next.map(({ skin, collection, collectionImage }) => renderTradeupCard(skin, collection, collectionImage)).join(''));
            rendered += next.length;
            if (rendered >= currentPool.length) observer.disconnect();

            //cards render instantly with "…" placeholders above; prices get patched in per-card once each one's
            //own getPrices() call resolves, same as the right-panel cards do, rather than blocking the whole batch
            //on every price in it before anything shows up
            const newCardEls = [...grid.children].slice(previousLength);
            const variant = currentCategory() === 'StatTrak' ? 'stattrak' : 'normal';
            newCardEls.forEach((cardEl, i) => {
                const { skin } = next[i];
                getPrices(skin.defIndex, skin.paintIndex).then(prices => {
                    const { low, high } = priceRangeFor(skin, prices, variant);
                    applyPrice(cardEl.querySelector('.tradeup-price-low'), low);
                    applyPrice(cardEl.querySelector('.tradeup-price-high'), high);
                });
            });
        }

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) renderNextBatch();
        }, {
            root: grid.closest('.tradeup-left'), //the left column scrolls independently, not the page
            rootMargin: '300px'
        });

        renderNextBatch();
        if (sentinel) observer.observe(sentinel);

        const rightGrid = document.getElementById('tradeup-right');
        const rarityField = document.getElementById('tfRarity');
        const categoryField = document.getElementById('tfCategory');
        rightGrid.innerHTML = Array(10).fill(renderTradeupSlotPlaceholder()).join('');

        //once any skin sits in the right panel, the whole contract is locked to that skin's rarity - a real trade-up
        //can't mix rarities. Reading the lock straight off rightGrid's own contents (rather than a separate tracked
        //variable) means it can never drift out of sync with what's actually selected.
        function setRarity(value) {
            const list = rarityField.querySelector('.custom-select-list');
            const val = rarityField.querySelector('.tf-select-val');
            list.querySelectorAll('.custom-select-opt').forEach(o => o.classList.toggle('active', o.dataset.value === value));
            val.textContent = value;
            applyFilters();
        }

        function syncRarityLock() {
            const lockedCard = rightGrid.querySelector('.tradeup-card-right');
            rarityField.classList.toggle('tf-field--locked', !!lockedCard);
            //Category is locked alongside Rarity, same condition (at least one input already picked) - switching
            //StatTrak/Normal mid-contract would change what every already-placed input's price actually means
            categoryField?.classList.toggle('tf-field--locked', !!lockedCard);
            setRarity(lockedCard ? lockedCard.dataset.rarity : 'All Rarities');
        }

        function syncSlotCount() {
            const rarity = rarityField.querySelector('.custom-select-opt.active')?.dataset.value;
            const target = rarity === 'Covert' ? 5 : 10;
            const realCount = rightGrid.querySelectorAll('.tradeup-card-right').length;
            const placeholders = [...rightGrid.querySelectorAll('.tradeup-slot-placeholder')];
            const desired = target - realCount;

            if (placeholders.length > desired) {
                placeholders.slice(desired).forEach(p => p.remove());
            } else if (placeholders.length < desired) {
                rightGrid.insertAdjacentHTML('beforeend', Array(desired - placeholders.length).fill(renderTradeupSlotPlaceholder()).join(''));
            }
        }

        //===================CLICK LISTENERS============================
        grid.addEventListener('click', e => {
            const card = e.target.closest('.tradeup-card');
            if (!card) return;
            const rarity = card.dataset.rarity;
            const limit = rarity === 'Covert' ? 5 : 10;
            const cardNum = rightGrid.querySelectorAll('.tradeup-card-right').length;
            if (cardNum < limit) {
                //no updateOutcomes() check here even though this card might complete the grid - the price hasn't
                //loaded yet at this point (renderTradeupRight inserts synchronously, getPrices() resolves later),
                //so applyPrices()'s own check above already covers this once real price data is actually in
                renderTradeupRight(card.dataset.weapon, card.dataset.name, allSkins)
                if (cardNum === 0) syncRarityLock();
                syncSlotCount();
            }
        })

        document.getElementById('tradeupReset')?.addEventListener('click', () => {
            rightGrid.innerHTML = Array(10).fill(renderTradeupSlotPlaceholder()).join('');
            syncRarityLock();
            updateOutcomes(collections, cases, skins);
        });

        rightGrid.addEventListener('click', e => {
            const deleteBtn = e.target.closest('.tradeup-delete-btn');
            const copyBtn = e.target.closest('.tradeup-copy-btn')
            const editBtn = e.target.closest('.tradeup-edit-btn');
            if (editBtn) {
                const card = editBtn.closest('.tradeup-card-right');
                editPrice(card);
                const limit = card.dataset.rarity === 'Covert' ? 5 : 10;
                const cardNum = rightGrid.querySelectorAll('.tradeup-card-right').length;
                if (cardNum === limit) updateOutcomes(collections, cases, skins);
            }

            if (deleteBtn) {
                deleteBtn.closest('.tradeup-card-right').remove();
                const cardNum = rightGrid.querySelectorAll('.tradeup-card-right').length;
                if (cardNum === 0) {
                    rarityField.classList.toggle('tf-field--locked');
                    categoryField?.classList.toggle('tf-field--locked');
                }
                syncSlotCount();
                //the deleted card is already gone by this point, so its own data-rarity can't be read anymore -
                //the rarity dropdown's own active value is used instead
                const rarity = rarityField.querySelector('.custom-select-opt.active')?.dataset.value;
                const limit = rarity === 'Covert' ? 5 : 10;
                if (cardNum === limit) {
                    updateOutcomes(collections, cases, skins);
                } else {
                    //no longer full - reset back to blank instead of leaving the last full-panel result on screen
                    document.getElementById('tradeup-outcomes').outerHTML = outcomes();
                    document.getElementById('tradeupPossibleOutcomes').innerHTML = '';
                }
            }
            if (copyBtn) {
                const card = e.target.closest('.tradeup-card-right');
                const rarity = card.dataset.rarity;
                const limit = rarity === 'Covert' ? 5 : 10;
                const cardFloat = parseFloat(card.querySelector('.tradeup-float-input').value) || 0;
                const cardNum = rightGrid.querySelectorAll('.tradeup-card-right').length;
                if (cardNum < limit) {
                    renderTradeupRight(card.dataset.weapon, card.dataset.name, allSkins, cardFloat, card._prices)
                    syncSlotCount();
                }
                if (cardNum === 0) syncRarityLock();
                if (cardNum === limit) updateOutcomes(collections, cases, skins);
            }
        })

        rightGrid.addEventListener('input', e => {
            const floatInput = e.target.closest('.tradeup-float-input');
            if (floatInput) {
                const card = floatInput.closest('.tradeup-card-right');
                const value = cheapestPrice(card._prices, tierKeyForFloat(parseFloat(floatInput.value) || 0));
                applyPrice(card.querySelector('.tradeup-price-pill'), value);
                const limit = card.dataset.rarity === 'Covert' ? 5 : 10;
                const cardNum = rightGrid.querySelectorAll('.tradeup-card-right').length;
                if (cardNum === limit) updateOutcomes(collections, cases, skins);
            }

            const priceInput = e.target.closest('.tradeup-price-popup-input');
            if (priceInput) {
                const card = priceInput.closest('.tradeup-card-right');
                //typed against whatever currency is currently displayed, so it's converted back to usd for storage -
                //everything else in this file works in usd internally and only converts at render time
                applyPrice(card.querySelector('.tradeup-price-pill'), toUsd(parseFloat(priceInput.value) || 0));
                const limit = card.dataset.rarity === 'Covert' ? 5 : 10;
                const cardNum = rightGrid.querySelectorAll('.tradeup-card-right').length;
                if (cardNum === limit) updateOutcomes(collections, cases, skins);
            }
        })

        //shared by the search box, rarity dropdown, and collection dropdown, so all three combine instead of each one
        //overriding the others - reads whatever's currently in every control, filters allSkins by all of them together
        function applyFilters() {
            const query = document.querySelector('.tf-input')?.value.trim().toLowerCase() || '';
            const rarity = document.querySelector('#tfRarity .custom-select-opt.active')?.dataset.value || 'All Rarities';
            const selectedCollection = document.querySelector('#tfCollection .custom-select-opt.active')?.dataset.value || 'All Collections';
            //StatTrak excludes skins with no StatTrak version at all (skin.stattrak === false), and separately excludes
            //any Covert ("red") skin whose collection's gold pool is gloves - gloves can never be StatTrak in the real
            //game, so a StatTrak trade-up into one isn't actually possible even though the input skin itself might
            //otherwise support StatTrak. Normal/Souvenir add no extra filtering of their own here.
            const category = currentCategory();

            observer.disconnect(); //about to reset pagination from scratch against whatever pool applies below

            currentPool = (!query && rarity === 'All Rarities' && selectedCollection === 'All Collections' && category !== 'StatTrak')
                ? allSkins
                : allSkins.filter(({ skin, collection, goldIsGloves }) => {
                    const matchesQuery = !query || `${skin.weapon} ${skin.name}`.toLowerCase().includes(query);
                    const matchesRarity = rarity === 'All Rarities' || skin.rarity.name === rarity;
                    const matchesCollection = selectedCollection === 'All Collections' || collection === selectedCollection;
                    const matchesCategory = category !== 'StatTrak' || (skin.stattrak && !(skin.rarity.name === 'Covert' && goldIsGloves));
                    return matchesQuery && matchesRarity && matchesCollection && matchesCategory;
                });

            grid.innerHTML = currentPool.length ? '' : '<p class="explore-empty">No matches found.</p>';
            rendered = 0;
            if (currentPool.length) {
                renderNextBatch();
                if (sentinel) observer.observe(sentinel);
            }
        }

        //fill the Collection dropdown with every collection that actually has at least one tradeupable skin - no point
        //listing a collection you'd just pick and immediately see "No matches found" for
        const collectionList = document.querySelector('#tfCollection .custom-select-list');
        if (collectionList) {
            const collectionNames = tradeUpData
                .filter(t => t.tradeupable.length > 0)
                .map(t => t.collection)
                .sort((a, b) => a.localeCompare(b));
            collectionList.innerHTML = ['All Collections', ...collectionNames]
                .map((name, i) => `<button class="custom-select-opt${i === 0 ? ' active' : ''}" data-value="${name}" type="button">${name}</button>`)
                .join('');
        }

        //reorders whatever's currently rendered in the grid, reading each card's low price straight off its own
        //pill text (same approach as `total`/`profitChance` elsewhere in this file) rather than re-fetching or
        //re-rendering anything - cards paginated in later just get appended unsorted at the end as usual, this
        //isn't a persistent sort applied to the whole underlying pool
        function sortVisibleCards(sortBy) {
            const priced = [...grid.querySelectorAll('.tradeup-card')].map(card => {
                const low = parseFloat(card.querySelector('.tradeup-price-low')?.dataset.usd);
                return { card, price: Number.isNaN(low) ? null : low }; //still-loading ("…") or genuinely unpriced ("N/A") both parse to null here
            });
            priced.sort((a, b) => {
                if (a.price === null && b.price === null) return 0;
                if (a.price === null) return 1; //no price always sinks to the bottom, regardless of direction
                if (b.price === null) return -1;
                return sortBy === 'Most Expensive' ? b.price - a.price : a.price - b.price;
            });
            priced.forEach(({ card }) => grid.appendChild(card)); //appendChild on an existing node moves it - this reorders in place, no re-render
        }

        document.querySelector('.tf-input')?.addEventListener('input', applyFilters);
        wireDropdown(document.getElementById('tfRarity'), applyFilters);
        wireDropdown(document.getElementById('tfCollection'), applyFilters, true);
        wireDropdown(document.getElementById('tfSort'), sortVisibleCards);
        //re-renders the left grid (so newly-rendered cards pick up the new category via currentCategory()) and
        //patches the already-placed right-panel cards in place, rather than re-adding them
        wireDropdown(document.getElementById('tfCategory'), () => {
            applyFilters();
            updateRightPanelForCategory();
        });

    }).catch(() => {
        const grid = document.getElementById('tradeupGrid');
        if (grid) grid.innerHTML = `<p class="explore-empty">Failed to load skins.</p>`;
    });
}