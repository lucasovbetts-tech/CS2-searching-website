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
const BATCH_SIZE = 100;


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
    return `radial-gradient(ellipse at 50% 35%, ${hex} 0%, ${darken(hex, 0.4)} 55%, ${darken(hex, 0.1)} 100%)`;
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
            <span class="tradeup-collection-wrap" data-tooltip="${collection}">
                ${collectionImage ? `<img class="tradeup-collection-img" src="${collectionImage}" alt="${collection}">` : '<span class="tradeup-collection-img tradeup-collection-img--empty"></span>'}
            </span>
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
                <div class="tradeup-right"></div>
            </div>
        </div>
    `;
    //Rarity and Collection actually affect what's shown, so they're wired separately below once allSkins exists; these two stay purely visual
    ['tfSort', 'tfCategory'].forEach(id => wireDropdown(document.getElementById(id)));
    return Promise.all([getSkins(), getCollections(), getCases()]).then(([skins, collections, cases]) => {
        
        //"Limited Edition Item" isn't a real skin collection - it's a catch-all bucket the API uses for Battle Pass/XP-shop
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

        grid.innerHTML = ''; //clear the "Loading…" placeholder before appending real cards
        let rendered = 0;

        function renderNextBatch() {
            const next = allSkins.slice(rendered, rendered + BATCH_SIZE);
            grid.insertAdjacentHTML('beforeend', next.map(({ skin, collection, collectionImage }) => renderTradeupCard(skin, collection, collectionImage)).join(''));
            rendered += next.length;
            if (rendered >= allSkins.length) observer.disconnect(); //nothing left to load, stop watching the sentinel
        }

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) renderNextBatch();
        }, { rootMargin: '300px' }); //start loading the next batch a bit before the sentinel is actually on-screen

        renderNextBatch(); //first batch renders immediately, no need to wait on a scroll
        if (sentinel) observer.observe(sentinel);

        //shared by the search box, rarity dropdown, and collection dropdown, so all three combine instead of each one
        //overriding the others - reads whatever's currently in every control, filters allSkins by all of them together
        function applyFilters() {
            const query = document.querySelector('.tf-input')?.value.trim().toLowerCase() || '';
            const rarity = document.querySelector('#tfRarity .custom-select-opt.active')?.dataset.value || 'All Rarities';
            const selectedCollection = document.querySelector('#tfCollection .custom-select-opt.active')?.dataset.value || 'All Collections';

            observer.disconnect(); //any filter bypasses pagination - stop auto-loading more default batches underneath it

            if (!query && rarity === 'All Rarities' && selectedCollection === 'All Collections') {
                grid.innerHTML = '';
                rendered = 0;
                renderNextBatch();
                if (sentinel) observer.observe(sentinel);
                return;
            }

            const matches = allSkins.filter(({ skin, collection }) => {
                const matchesQuery = !query || skin.name.toLowerCase().includes(query) || skin.weapon.toLowerCase().includes(query);
                const matchesRarity = rarity === 'All Rarities' || skin.rarity.name === rarity;
                const matchesCollection = selectedCollection === 'All Collections' || collection === selectedCollection;
                return matchesQuery && matchesRarity && matchesCollection;
            });

            grid.innerHTML = matches.length
                ? matches.map(({ skin, collection, collectionImage }) => renderTradeupCard(skin, collection, collectionImage)).join('')
                : '<p class="explore-empty">No matches found.</p>';
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
    }).catch(() => {
        const grid = document.getElementById('tradeupGrid');
        if (grid) grid.innerHTML = `<p class="explore-empty">Failed to load skins.</p>`;
    });
}
