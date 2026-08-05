import { getSkins } from '../api/skins.js'
import { getCollections } from '../api/collections.js';
import { getCases } from '../api/crates.js';


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

//flat placeholder pricing by wear, standing in for real market prices until that's wired up
const WEAR_PRICES = {
    'Battle-Scarred': 5,
    'Well-Worn': 10,
    'Field-Tested': 15,
    'Minimal Wear': 20,
    'Factory New': 25,
};

//standard CS2 wear breakpoints - same for every skin, independent of that skin's own min/max float range
function getWear(float) {
    if (float < 0.07) return 'Factory New';
    if (float < 0.15) return 'Minimal Wear';
    if (float < 0.38) return 'Field-Tested';
    if (float < 0.45) return 'Well-Worn';
    return 'Battle-Scarred';
}


document.addEventListener('click', e => {
    if (e.target.closest('.tf-field--select')) return; 
    document.querySelectorAll('.tradeup-toolbar .tf-field--select.open, .tradeup-toolbar .custom-select-list.open, .tradeup-toolbar .tf-select-btn.open')
        .forEach(el => el.classList.remove('open'));
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
    return `
    <div class="skin-card tradeup-card" data-weapon="${skin.weapon}" data-name="${skin.name}" data-rarity="${skin.rarity.name}" style="background: ${rarityGradient(skin.rarity.color)}">
        <div class="tradeup-price-row">
            <span class="tradeup-price-pill" id="tradeUpPriceLow">£10</span>
            <span class="tradeup-price-sep">–</span>
            <span class="tradeup-price-pill" id="tradeUpPriceHigh">£20</span>
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
            <p class="skin-name">${skin.name}</p>
        </div>
    </div>`;
}

//purely decorative - marks an empty spot in the right panel before a skin's been added there. No click behavior of its own.
//deliberately NOT given the .tradeup-card-right class, since that class is what syncRarityLock/cardNum count as "a real
//selected skin" - reuses the same inner skeleton (price row, image, meta row, name, input, actions) as a real card instead,
//just with blank content, so it takes up exactly the same height without needing a guessed aspect-ratio
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

function renderTradeupRight(weapon, name, skins, float = 0.035) {
    const rightGrid = document.getElementById('tradeup-right');
    const { skin, collection, collectionImage } = skins.find(s => s.skin.weapon === weapon && s.skin.name === name);
    const cardHTML = `
        <div class="skin-card tradeup-card-right" data-weapon="${skin.weapon}" data-name="${skin.name}" data-rarity="${skin.rarity.name}" style="background: ${rarityGradient(skin.rarity.color)}">
            <div class="tradeup-price-row">
                <span class="tradeup-price-pill">£${WEAR_PRICES[getWear(float)]}</span>
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
                <p class="skin-name">${skin.name}</p>
            </div>
            <input class="tradeup-float-input" type="number" min="0" max="1" step="0.001" value="${float}">
            <div class="tradeup-card-actions">
                <button class="tradeup-card-btn tradeup-edit-btn" type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-edit">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" />
                        <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415" />
                        <path d="M16 5l3 3" />
                    </svg>
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
    if (slot) {
        slot.insertAdjacentHTML('beforebegin', cardHTML);
        slot.remove();
    } else {
        rightGrid.insertAdjacentHTML('beforeend', cardHTML);
    }
}

//summary bar of trade-up math (float/cost/odds/profit) - takes plain numbers rather than computing them itself,
//since the actual simulation (weighted float, output odds across possible results) is a separate concern. Values
//default to 0 as a placeholder until that real calculation gets wired in
function outcomes({ averageFloat = 0, cost = 0, profitChance = 0, profitability = 0, averageProfit = 0, maxProfit = 0, maxLoss = 0 } = {}) {
    const profitabilityClass = profitability < 100 ? 'tradeup-outcome-value--negative' : 'tradeup-outcome-value--positive';
    const averageProfitClass = averageProfit < 0 ? 'tradeup-outcome-value--negative' : 'tradeup-outcome-value--positive';
    return `
    <div class="tradeup-outcomes">
        <h2 class="tradeup-outcomes-title">Outcomes</h2>
        <div class="tradeup-outcomes-stats">
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Average Float</span>
                <span class="tradeup-outcome-value">${averageFloat}</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Cost</span>
                <span class="tradeup-outcome-value">${cost}£</span>
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
                <span class="tradeup-outcome-value ${averageProfitClass}">${averageProfit}£</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Max Profit</span>
                <span class="tradeup-outcome-value tradeup-outcome-value--positive">${maxProfit}£</span>
            </div>
            <div class="tradeup-outcome-stat">
                <span class="tradeup-outcome-label">Max Loss</span>
                <span class="tradeup-outcome-value tradeup-outcome-value--negative">${maxLoss}£</span>
            </div>
        </div>
    </div>`;
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
                        ${renderDropdownField('tfCategory', 'Category', ['Normal', 'StatTrak', 'Souvenir'])}
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
                </div>
            </div>
        </div>
    `;
    return Promise.all([getSkins(), getCollections(), getCases()]).then(([skins, collections, cases]) => {
        
        //"Limited Edition Item" isn't a real skin collection - it's a catch-all bucket the API uses for armory pass
        //weapons, which don't work like normal collections and can't be traded up
        const tradeUpData = collections.filter(c => c.name !== 'Limited Edition Item').map(c => {
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

        //flat {skin, collection, collectionImage} per tradeupable skin - raw objects, not pre-rendered HTML, so search can filter by name/weapon
        const allSkins = tradeUpData.flatMap(({ collection, collectionImage, tradeupable }) => 
            tradeupable.map(skin => ({ skin, collection, collectionImage })));
            
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
            grid.insertAdjacentHTML('beforeend', next.map(({ skin, collection, collectionImage }) => renderTradeupCard(skin, collection, collectionImage)).join(''));
            rendered += next.length;
            if (rendered >= currentPool.length) observer.disconnect();
        }

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) renderNextBatch();
        }, {
            root: grid.closest('.tradeup-left'), //the left column scrolls independently now, not the page - intersection
            rootMargin: '300px' //has to be measured against that scroll container instead of the default (page viewport)
        });

        renderNextBatch();
        if (sentinel) observer.observe(sentinel);

        const rightGrid = document.getElementById('tradeup-right');
        const rarityField = document.getElementById('tfRarity');
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
            setRarity(lockedCard ? lockedCard.dataset.rarity : 'All Rarities');
        }

        //keeps total slots (real cards + placeholders) matching the cap for whatever rarity is locked in (5 for
        //Covert, 10 otherwise) - recalculated fresh from the DOM every time, so it stays correct no matter how many
        //cards were just added or removed, instead of trying to track "how many placeholders to add/remove" by hand.
        //Reads the cap off the Rarity dropdown's own active option (the same thing the user sees on screen) rather
        //than off whether a card currently exists, since the filter deliberately stays put after the last card is
        //deleted - the slot count needs to agree with that same lingering value, not silently jump back to 10
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
                renderTradeupRight(card.dataset.weapon, card.dataset.name, allSkins)
                if (cardNum === 0) syncRarityLock();
                syncSlotCount();
            }
        })

        document.getElementById('tradeupReset')?.addEventListener('click', () => {
            rightGrid.innerHTML = Array(10).fill(renderTradeupSlotPlaceholder()).join('');
            syncRarityLock();
        });

        rightGrid.addEventListener('click', e => {
            const deleteBtn = e.target.closest('.tradeup-delete-btn');
            const copyBtn = e.target.closest('.tradeup-copy-btn')
            if (deleteBtn) {
                deleteBtn.closest('.tradeup-card-right').remove();
                const cardNum = rightGrid.querySelectorAll('.tradeup-card-right').length;
                if (cardNum === 0) rarityField.classList.toggle('tf-field--locked');
                syncSlotCount()
            }
            if (copyBtn) {
                const card = e.target.closest('.tradeup-card-right');
                const rarity = card.dataset.rarity;
                const limit = rarity === 'Covert' ? 5 : 10;
                const cardFloat = parseFloat(card.querySelector('.tradeup-float-input').value) || 0;
                const cardNum = rightGrid.querySelectorAll('.tradeup-card-right').length;
                if (cardNum < limit) {
                    renderTradeupRight(card.dataset.weapon, card.dataset.name, allSkins, cardFloat)
                    syncSlotCount();
                }
                if (cardNum === 0) syncRarityLock();
            }
        })

        rightGrid.addEventListener('input', e => {
            const floatInput = e.target.closest('.tradeup-float-input');
            if (!floatInput) return;
            const pricePill = floatInput.closest('.tradeup-card-right').querySelector('.tradeup-price-pill');
            pricePill.textContent = `£${WEAR_PRICES[getWear(parseFloat(floatInput.value) || 0)]}`;
        })

        //shared by the search box, rarity dropdown, and collection dropdown, so all three combine instead of each one
        //overriding the others - reads whatever's currently in every control, filters allSkins by all of them together
        function applyFilters() {
            const query = document.querySelector('.tf-input')?.value.trim().toLowerCase() || '';
            const rarity = document.querySelector('#tfRarity .custom-select-opt.active')?.dataset.value || 'All Rarities';
            const selectedCollection = document.querySelector('#tfCollection .custom-select-opt.active')?.dataset.value || 'All Collections';

            observer.disconnect(); //about to reset pagination from scratch against whatever pool applies below

            currentPool = (!query && rarity === 'All Rarities' && selectedCollection === 'All Collections')
                ? allSkins
                : allSkins.filter(({ skin, collection }) => {
                    const matchesQuery = !query || `${skin.weapon} ${skin.name}`.toLowerCase().includes(query);
                    const matchesRarity = rarity === 'All Rarities' || skin.rarity.name === rarity;
                    const matchesCollection = selectedCollection === 'All Collections' || collection === selectedCollection;
                    return matchesQuery && matchesRarity && matchesCollection;
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

        document.querySelector('.tf-input')?.addEventListener('input', applyFilters);
        wireDropdown(document.getElementById('tfRarity'), applyFilters);
        wireDropdown(document.getElementById('tfCollection'), applyFilters, true);
        wireDropdown(document.getElementById('tfSort'));
        wireDropdown(document.getElementById('tfCategory'));

    }).catch(() => {
        const grid = document.getElementById('tradeupGrid');
        if (grid) grid.innerHTML = `<p class="explore-empty">Failed to load skins.</p>`;
    });
}
