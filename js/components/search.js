import { getWeapons } from '../api/weapons.js';
import { getCases, getStickerCapsules, getSouvenirPackages, getNonTournamentStickerCapsules } from '../api/crates.js'
import { getCollections } from '../api/collections.js';
import { getSkins } from '../api/skins.js'
import { getAgents, getCharms, getPatches, getMusicKits, getGraffiti, getPins, getStickers } from '../api/collectibles.js';

const CATEGORIES = ['all', 'cases', 'collections', 'pistols', 'smgs', 'rifles', 'heavy', 'knives', 'gloves'];

//arrow thingymabob for dropdowns
const CHEVRON = `<svg class="cat-chevron" viewBox="0 0 24 24" fill="none">
    <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function syncSearchWidth() {
    const cats   = document.querySelector('.weapon-cats');
    const search = document.querySelector('.search-wrap');
    if (!cats || !search) return;
    search.style.width = cats.offsetWidth + 'px';
}

// ADDS THE WEAPONS TO THE DROPDOWNS
async function populateDropdowns() {
    let weapons;
    let cases;
    let collections;

    try { weapons = await getWeapons(); } catch { return; } //IF FAILED TO FETCH JSON RETURN
    try { cases = await getCases(); } catch { return; }
    try { collections = await getCollections(); } catch { return; }

    const categoryData = { ...weapons, cases, collections }; //combines weapon-type categories with cases/collections into one lookup

    CATEGORIES.filter(c => c !== 'all').forEach(cat => { //REMOVES ALL FROM CATEGORIES
        const el = document.getElementById(`drop-${cat}`);
        if (!el || !categoryData[cat]) return;
        el.innerHTML = categoryData[cat]
            .map(w => {
                const name  = typeof w === 'string' ? w : w.name; //gets the name of the weapon
                const image = typeof w === 'string' ? null : w.image;
                return `<button class="cat-weapon">
                    ${image ? `<img class="cat-weapon-thumb" src="${image}" alt="">` : '<span class="cat-weapon-thumb cat-weapon-thumb--empty"></span>'}
                    ${name}
                </button>`;
            })
            .join('');
    });

    requestAnimationFrame(syncSearchWidth);
}

export function renderSearchSection() {
    return `
        <main class="main">
            <div class="hero">
                <h1 class="hero-title">Search for any skin in the game!</h1>
                <div class="search-bar-wrap">
                    <div class="search-wrap">
                        <svg class="search-icon" viewBox="0 0 24 24" fill="none">
                            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/>
                            <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                        <input class="search-input" type="text"
                            placeholder="e.g. AK-47 | Redline, AWP | Dragon Lore..."
                            autocomplete="off" spellcheck="false"/>
                        <button class="search-btn">Search</button>
                    </div>
                    <div class="search-results" id="searchResults"></div>
                </div>
                <div class="weapon-cats">
                    <button class="cat-btn cat-btn--all">All</button>
                    ${['cases','collections','pistols','smgs','rifles','heavy','knives','gloves'].map(id => `
                        <div class="cat-item" data-cat="${id}">
                            <button class="cat-btn">
                                ${id.charAt(0).toUpperCase() + id.slice(1)}
                                ${CHEVRON}
                            </button>
                            <div class="cat-dropdown">
                                <div class="cat-dropdown-inner" id="drop-${id}"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </main>
    `;
}

export function initSearch() {
    requestAnimationFrame(syncSearchWidth);
    populateDropdowns();

    let skins = [];
    getSkins().then(data => { skins = data.map(s => ({ ...s, kind: 'skin' })); });

    let weapons = [];
    getWeapons().then(data => { weapons = Object.values(data).flat().map(w => ({ ...w, kind: 'weapon' })); });

    let crates = [];
    Promise.all([getCases(), getCollections(), getStickerCapsules(), getSouvenirPackages(), getNonTournamentStickerCapsules()]).then(([cases, collections, capsules, souvenirs, nonTournamentCapsules]) => {
        crates = [...cases, ...collections, ...capsules, ...souvenirs, ...nonTournamentCapsules].map(c => ({ ...c, kind: 'crate' }));
    });

    //slug here matches explore.js's COLLECTIBLE_TYPES keys, so clicking a result can route to that type's page the same way
    const COLLECTIBLE_FETCHERS = {
        agents: getAgents, charms: getCharms, patches: getPatches,
        'music-kits': getMusicKits, graffiti: getGraffiti, pins: getPins
    };
    let collectibles = [];
    Promise.all(Object.entries(COLLECTIBLE_FETCHERS).map(([slug, fetchType]) =>
        fetchType().then(data => data.map(item => ({ ...item, kind: 'collectible', slug })))
    )).then(results => { collectibles = results.flat(); });

    let stickers = [];
    getStickers().then(data => { stickers = data.map(s => ({ ...s, kind: 'sticker' })); });

    document.querySelector('.search-input')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const queryWords = query.split(' ').filter(Boolean); //drops empty strings from extra spaces
        const combined = [...skins, ...weapons, ...crates, ...collectibles, ...stickers];
        const filtered = combined.filter(item => {
            const searchable = (item.kind === 'skin' ? `${item.weapon} ${item.name}` : item.name).toLowerCase(); //skins search weapon+name together, everything else just searches its own name
            return queryWords.every(word => searchable.includes(word));
        });

        const resultsEl = document.getElementById('searchResults');
        if (!resultsEl) return;

        if (!queryWords.length) {
            resultsEl.innerHTML = '';
            return;
        }

        resultsEl.innerHTML = filtered.length ? filtered.map(f => {
            const dataAttr = f.kind === 'skin' ? `data-def="${f.defIndex}" data-paint="${f.paintIndex}"`
                : f.kind === 'crate' ? `data-crate="${f.name}"`
                : f.kind === 'collectible' ? `data-collectible="${f.slug}" data-id="${f.id}"`
                : f.kind === 'sticker' ? `data-sticker-id="${f.id}"`
                : `data-weapon="${f.name}"`;
            const label = f.kind === 'skin' ? `${f.weapon} | ${f.name}${f.phase ? ` | ${f.phase}` : ''}` : f.name;
            return `
            <div class="search-result" ${dataAttr}>
                ${f.image ? `<img class="search-result-img" src="${f.image}" alt="${f.name}">` : '<span class="search-result-img search-result-img--empty"></span>'}
                <span class="search-result-name">${label}</span>
            </div>`;
        }).join('') : '<p class="explore-empty">No results found.</p>';
    });

    document.getElementById('searchResults')?.addEventListener('click', e => {
        const result = e.target.closest('.search-result');
        if (!result) return;
        if (result.dataset.def) window.location.hash = '#/skin/' + result.dataset.def + '-' + result.dataset.paint;
        else if (result.dataset.crate) window.location.hash = '#/explore/crate/' + encodeURIComponent(result.dataset.crate);
        else if (result.dataset.collectible) window.location.hash = '#/collectible/' + result.dataset.collectible + '/' + result.dataset.id;
        else if (result.dataset.stickerId) window.location.hash = '#/sticker/' + result.dataset.stickerId;
        else if (result.dataset.weapon) window.location.hash = '#/explore/' + encodeURIComponent(result.dataset.weapon);
    });

    document.addEventListener('click', e => {
        if (e.target.closest('.search-bar-wrap')) return; //click was inside the search bar or its results, leave it open
        const resultsEl = document.getElementById('searchResults');
        if (resultsEl) resultsEl.innerHTML = '';
    });

    document.querySelector('.weapon-cats')?.addEventListener('click', e => {
        const btn = e.target.closest('.cat-weapon');
        if (!btn) return;
        const cat = btn.closest('.cat-item')?.dataset.cat;
        const isCrateCat = cat === 'cases' || cat === 'collections';
        window.location.hash = '#/explore/' + (isCrateCat ? 'crate/' : '') + encodeURIComponent(btn.textContent.trim());
    });

    const allBtn = document.querySelector('.cat-btn--all');
    allBtn?.addEventListener('click', () => {
        window.location.hash = '#/explore/'
    });
}