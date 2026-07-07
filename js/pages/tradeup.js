import { getSkins } from '../api/skins.js'
import { getCollections } from '../api/collections.js';
import { getCases } from '../api/crates.js';

//lower rank = rarer; a collection's gold (knife/glove) always outranks every gun rarity, even Covert
const RARITY_RANK = {
    'Covert': 1,
    'Classified': 2,
    'Restricted': 3,
    'Mil-Spec Grade': 4,
    'Industrial Grade': 5,
    'Consumer Grade': 6,
};
const GOLD_RANK = 0;
const BATCH_SIZE = 100;

//same darken/gradient look explore.js and skin-detail.js use, kept in sync by hand since there's no shared module for it yet
function darken(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function rarityGradient(hex) {
    return `radial-gradient(ellipse at 50% 35%, ${hex} 0%, ${darken(hex, 0.4)} 55%, ${darken(hex, 0.1)} 100%)`;
}

//one tradeupable skin's card - same shape as explore.js's skin-card, plus the collection's own image next to a shortened wear-bar
function renderTradeupCard(s, collection, collectionImage) {
    return `
    <div class="skin-card tradeup-card" style="background: ${rarityGradient(s.rarity.color)}">
        <div class="tradeup-price-row">
            <span class="tradeup-price-pill">£10</span>
            <span class="tradeup-price-sep">–</span>
            <span class="tradeup-price-pill">£20</span>
        </div>
        ${s.image ? `<img class="skin-img" src="${s.image}" alt="${s.weapon} | ${s.name}">` : '<div class="skin-img-placeholder"></div>'}
        <div class="tradeup-meta-row">
            ${collectionImage ? `<img class="tradeup-collection-img" src="${collectionImage}" alt="${collection}" title="${collection}">` : '<span class="tradeup-collection-img tradeup-collection-img--empty"></span>'}
            <div class="tradeup-wear-bar" data-tooltip="Float range: ${s.minFloat} – ${s.maxFloat}">
                <span class="tradeup-wear-marker" style="left: ${s.minFloat * 100}%"></span>
                <span class="tradeup-wear-marker" style="left: ${s.maxFloat * 100}%"></span>
            </div>
        </div>
        <div class="tradeup-name-col">
            <span class="skin-weapon">${s.weapon}</span>
            <p class="skin-name">${s.name}</p>
        </div>
    </div>`;
}

export function renderTradeup() {
    document.getElementById('app').innerHTML = `
        <div class="tradeup-layout">
            <h1 class="tradeup-title">Select Skins for TradeUp</h1>
            <div class="tradeup-columns">
                <div class="tradeup-left">
                    <div class="tradeup-grid" id="tradeupGrid">
                        <p class="explore-loading">Loading…</p>
                    </div>
                    <div id="tradeupSentinel"></div>
                </div>
                <div class="tradeup-divider"></div>
                <div class="tradeup-right"></div>
            </div>
        </div>
    `;

    return Promise.all([getSkins(), getCollections(), getCases()]).then(([skins, collections, cases]) => {
        const tradeUpData = collections.map(c => {
            const linkedCaseIds = c.crates.map(crate => crate.id);
            const hasGold = cases.some(cs => linkedCaseIds.includes(cs.id)); //every real Case has a non-empty contains_rare, so a match is enough

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

            return { collection: c.name, collectionImage: c.image, hasGold, tradeupable };
        });

        const grid = document.getElementById('tradeupGrid');
        const sentinel = document.getElementById('tradeupSentinel');
        if (!grid) return;

        //one HTML string per card, not joined yet - lets us slice out a batch at a time instead of building/inserting everything at once
        const allCards = tradeUpData.flatMap(({ collection, collectionImage, tradeupable }) =>
            tradeupable.map(s => renderTradeupCard(s, collection, collectionImage)));

        if (!allCards.length) {
            grid.innerHTML = '<p class="explore-empty">No tradeupable skins found.</p>';
            return;
        }

        grid.innerHTML = ''; //clear the "Loading…" placeholder before appending real cards
        let rendered = 0;

        function renderNextBatch() {
            const next = allCards.slice(rendered, rendered + BATCH_SIZE);
            grid.insertAdjacentHTML('beforeend', next.join(''));
            rendered += next.length;
            if (rendered >= allCards.length) observer.disconnect(); //nothing left to load, stop watching the sentinel
        }

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) renderNextBatch();
        }, { rootMargin: '300px' }); //start loading the next batch a bit before the sentinel is actually on-screen

        renderNextBatch(); //first batch renders immediately, no need to wait on a scroll
        if (sentinel) observer.observe(sentinel);
    }).catch(() => {
        const grid = document.getElementById('tradeupGrid');
        if (grid) grid.innerHTML = `<p class="explore-empty">Failed to load skins.</p>`;
    });
}
