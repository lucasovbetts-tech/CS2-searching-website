import { getSkins, getSkinsByWeapon } from '../api/skins.js';
import { getWeapons } from '../api/weapons.js';
import { getStickerCapsules, getSouvenirPackages, getNonTournamentStickerCapsules, getCases } from '../api/crates.js';
import { getCollections } from '../api/collections.js';
import { getAgents, getCharms, getPatches, getMusicKits, getGraffiti, getPins } from '../api/collectibles.js';

console.log(await getStickerCapsules(), await getSouvenirPackages(), await getNonTournamentStickerCapsules(), await getCases(), await getSkins(), await getAgents(), await getCharms(), await getPatches(), await getMusicKits(), await getGraffiti(), await getPins(), await getCollections());

//scales a hex color's RGB channels down toward black by `factor` (0-1), e.g. darken('#ffd700', 0.4) -> a dimmer gold
function darken(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

//builds the same "glow behind the item, fading to near-black at the edges" look for any rarity color
function rarityGradient(hex) {
    return `radial-gradient(ellipse at 50% 35%, ${hex} 0%, ${darken(hex, 0.4)} 55%, ${darken(hex, 0.1)} 100%)`;
}

//rendering the sticker capsules and souvenir packages
function renderCrateSection (items, title) {
    let goldItems = []
    const cards = items.map(i => {
        const name = i.name;
        const img = i.image;
        if (i.contains_rare) goldItems.push(...i.contains_rare); //collections don't have a contains_rare field at all
        const count = i.contains ? i.contains.length : 0;

        return `
        <button class="weapon-card" data-crate="${name}">
            ${img ? `<img class="weapon-card-img" src="${img}" alt="${name}">` : '<div class="weapon-card-img weapon-card-img--empty"></div>'}
            <span class="weapon-card-name">${name}</span>
            <span class="weapon-card-count">${count} ${count === 1 ? 'item' : 'items'}</span>
        </button>`;
    }).join('');

    return `
    <section id="category-${slugify(title)}">
        <h2 class="weapon-category-title">${title}</h2>
        <div class="weapon-grid">${cards}</div>
    </section>`;
}

//turns a title like "Sticker Capsules" into "sticker-capsules", to build/match section ids consistently
function slugify(title) {
    return title.toLowerCase().replace(/\s+/g, '-');
}

const nameMap = {
    "smgs": "SMGs"
};
const sideBarBtns = ["Cases", "Collections", "Sticker Capsules", "Souvenir Packages"]
const categoryOrder = ["knives", "gloves", "pistols", "smgs", "rifles", "heavy"];
let sortDescending = false; //toggled by the sort button on skin/crate-contents grids, rarest first by default

function explorePageSorting(skins, weaponData) {
    sortByRarity(skins); //so the first skin.find() hits for a weapon is the rarest one, not just whatever order the API returned

    const counts = {};
    skins.forEach(s => { counts[s.weapon] = (counts[s.weapon] ?? 0) + 1; }); //counts the amount of skins per weapon

    return categoryOrder.map(category => { //loops through categoryOrder in the order we defined, e.g. "knives", "gloves", "pistols", ...
        const weapons = weaponData[category]; //looks up the weapons array for this category, e.g. weaponData["pistols"]

        const cards = weapons.map(w => { //loops through each weapon in the category
            const weapon = w.name;
            const count = counts[weapon] ?? 0;
            const img = skins.find(s => s.weapon === weapon)?.image;

            //creates the card for the weapon categories on the explore page
            return `
            <button class="weapon-card" data-weapon="${weapon}">
                ${img ? `<img class="weapon-card-img" src="${img}" alt="${weapon}">` : '<div class="weapon-card-img weapon-card-img--empty"></div>'}
                <span class="weapon-card-name">${weapon}</span>
                <span class="weapon-card-count">${count} ${count === 1 ? 'skin' : 'skins'}</span>
            </button>`;
        }).join('');

        //capitalize first letter
        let weaponCat = nameMap[category] || category[0].toUpperCase() + category.slice(1);

        return `
        <section id="category-${category}">
            <h2 class="weapon-category-title">${weaponCat}</h2>
            <div class="weapon-grid">${cards}</div>
        </section>`;
    }).join('');
}

//lets you click a skin/sticker/collectible card to open its detail page; ignores clicks on the CSFloat link so that keeps working on its own
function attachSkinCardNav(grid) {
    grid.addEventListener('click', e => {
        if (e.target.closest('.csfloat-link')) return;
        const card = e.target.closest('.skin-card');
        if (!card) return;
        if (card.dataset.def) window.location.hash = '#/skin/' + card.dataset.def + '-' + card.dataset.paint;
        else if (card.dataset.stickerId) window.location.hash = '#/sticker/' + card.dataset.stickerId;
        else if (card.dataset.slug && card.dataset.id) window.location.hash = '#/collectible/' + card.dataset.slug + '/' + card.dataset.id;
    });
}

//animates scrolling to targetY over `duration` ms, using an ease-out curve (starts fast, slows near the end)
function smoothScrollTo(targetY, duration = 600) {
    const startY = window.scrollY;
    const distance = targetY - startY;
    const startTime = performance.now();

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1); //0 at the start, 1 once the duration's up
        const eased = 1 - Math.pow(1 - progress, 3); //ease-out cubic

        window.scrollTo(0, (startY + distance * eased)-200);

        if (progress < 1) requestAnimationFrame(step); //keep going until we hit the target
    }

    requestAnimationFrame(step);
}

//builds the sidebar of jump-links to each weapon category section, plus the cases/collections/capsules/souvenirs sections
function renderCategorySidebar() {
    const weaponBtns = categoryOrder.map(category => {
        const label = nameMap[category] || category[0].toUpperCase() + category.slice(1);
        return `<button class="category-sidebar-btn" data-target="category-${category}">${label}</button>`;
    }).join('');

    const crateBtns = sideBarBtns.map(title => {
        return `<button class="category-sidebar-btn" data-target="category-${slugify(title)}">${title}</button>`;
    }).join('');

    return `
    <nav class="category-sidebar">
        <p class="categoryTitle">Categories</p>
        ${weaponBtns}
        ${crateBtns}
        <button class="category-sidebar-btn" data-target="category-collectibles">Other</button>
    </nav>`;
}
const rarityMaps = {
    "Contraband": 0,
    "Extraordinary": 1,
    "Covert": 2,
    "Classified": 3,
    "Restricted": 4,
    "Mil-Spec Grade": 5,
    "Industrial Grade": 6,
    "Consumer Grade": 7,
    //stickers use a separate rarity track (Base Grade -> Exotic)
    "Exotic": 8,
    "Remarkable": 9,
    "High Grade": 10,
    "Base Grade": 11,
    //agents use yet another separate track (Distinguished -> Master)
    "Master": 12,
    "Superior": 13,
    "Exceptional": 14,
    "Distinguished": 15,
};

//creates the card for the skin
export function renderSkinCard(skins, weapon) {

    sortByRarity(skins, sortDescending)

    if (skins.length === 0) {
        return `<p class="explore-empty">No skins available for ${weapon} yet.</p>`; //if there isnt any skins dont load a skincard
    }
    return skins.map(s => `
        <div class="skin-card" data-def="${s.defIndex}" data-paint="${s.paintIndex}" style="background: ${rarityGradient(s.rarity.color)}">
            <span class="skin-rarity">${s.rarity.name}</span>
            ${s.image ? `<img class="skin-img" src="${s.image}" alt="${s.weapon} | ${s.name}">` : '<div class="skin-img-placeholder"></div>'}
            <div class="wear-bar" data-tooltip="Float range: ${s.minFloat} – ${s.maxFloat}">
                <span class="wear-bar-marker" style="left: ${s.minFloat * 100}%"></span>
                <span class="wear-bar-marker" style="left: ${s.maxFloat * 100}%"></span>
            </div>
            <span class="skin-weapon">${s.category === "Knives" || s.category === "Gloves" ? `★ ${s.weapon}` : s.weapon}</span>
            <p class="skin-name">${s.name} ${s.phase ? ` | ${s.phase}`:''}</p>
            <div class="skinCardSpecialContainer">
                <div class="skin-badges">
                    <span class="skin-badge skin-badge--normal">Normal</span>
                    ${s.stattrak ? '<span class="skin-badge skin-badge--stattrak">StatTrak™</span>' : ''}
                    ${s.souvenir ? '<span class="skin-badge skin-badge--souvenir">Souvenir</span>' : ''}
                </div>
                    <div class="skinCardPrices">
                        <p class="skinCardPriceNormal">£10 -> £20</p>
                        ${s.stattrak ? '<p class="skinCardPriceStattrak">£20 -> £30</p>' : ''}
                        ${s.souvenir ? '<p class="skinCardPriceSouvenir">£30 -> £40</p>' : ''}
                    </div>
                    <a class="csfloat-link" href="https://csfloat.com/search?def_index=${s.defIndex}&paint_index=${s.paintIndex}" target="_blank" rel="noopener">View on CSFloat</a>
            </div>
        </div>
    `).join('');
}

//creates the card for an item inside a capsule/souvenir/case/collection (sticker or skin, both are just name + image here)
function renderCrateContentsCard(items, crateName, skins) {

    sortByRarity(items, sortDescending)

    if (!items || items.length === 0) {
        return `<p class="explore-empty">Nothing found for ${crateName}.</p>`;
    }
    return items.map(i => {
        const name = i.name; //now you can call string methods on this, e.g. name.replace(...), name.split(...)
        let [weapon, skin] = name.split("|").map(s => s.trim());
        const weaponName = weapon.replace("★ ", "");
        if (skin === undefined) {
            skin = 'Vanilla'
        }
    const match = skins.find(s => s.weapon === weaponName && s.name === skin);
    const minFloat = match?.minFloat;
    const maxFloat = match?.maxFloat;
    const stattrak = match?.stattrak;
    const souvenir = match?.souvenir;
    const csfloatLink = match ? `https://csfloat.com/search?def_index=${match.defIndex}&paint_index=${match.paintIndex}` : null;

        return `
        <div class="skin-card" ${match ? `data-def="${match.defIndex}" data-paint="${match.paintIndex}"` : `data-sticker-id="${i.id}"`} style="background: ${rarityGradient(i.rarity.color)}">
            <span class="skin-rarity">${i.rarity.name}</span>
            ${i.image ? `<img class="skin-img" src="${i.image}" alt="${name}">` : '<div class="skin-img-placeholder"></div>'}
            ${match ? `
            <div class="wear-bar" data-tooltip="Float range: ${minFloat} – ${maxFloat}">
                <span class="wear-bar-marker" style="left: ${minFloat * 100}%"></span>
                <span class="wear-bar-marker" style="left: ${maxFloat * 100}%"></span>
            </div>
            ` : ''}
            <p class="skin-weapon">${weapon}</p>
            <p class="skin-name">${skin} ${i.phase ? `${i.phase}` : ''}</p>
                <div class="skinCardSpecialContainer">
                    <div class="skin-badges">
                        <span class="skin-badge skin-badge--normal">Normal</span>
                        ${stattrak ? '<span class="skin-badge skin-badge--stattrak">StatTrak™</span>' : ''}
                        ${souvenir ? '<span class="skin-badge skin-badge--souvenir">Souvenir</span>' : ''}
                    </div>
                    <div class="skinCardPrices">
                        <p class="skinCardPriceNormal">£10 -> £20</p>
                        ${stattrak ? '<p class="skinCardPriceStattrak">£20 -> £30</p>' : ''}
                        ${souvenir ? '<p class="skinCardPriceSouvenir">£40 -> £50</p>' : ''}
                    </div>
                    ${csfloatLink ? `<a class="csfloat-link" href="${csfloatLink}" target="_blank" rel="noopener">View on CSFloat</a>` : ''}
                </div>
        </div>
        `;
    }).join('');
}

function renderCaseCard(crate) {
    const name = crate.name;
    const img = crate.image;
    const csfloatLink = `https://csfloat.com/search?def_index=${crate.def_index}`
    const color = crate.rarity?.color ?? '#a855f7'; //collections have no rarity field at all (mixed rarities inside), so fall back to the app's accent color
    return `
        <div class="case-hero-card" style="background: ${rarityGradient(color)}">
            ${img ? `<img class="case-hero-img" src="${img}" alt="${name}">` : '<div class="skin-img-placeholder"></div>'}
            <div class="skinCardPrices">
                <p class="skinCardPriceNormal">£20</p>
            </div>
            ${csfloatLink ? `<a class="csfloat-link" href="${csfloatLink}" target="_blank" rel="noopener">View on CSFloat</a>` : ''}
        </div>`;
}


//sort all of the skin cards, rarest first unless descending is true (then rarest last)
function sortByRarity(items, descending = false) {
    return items.sort((a, b) => descending
        ? rarityMaps[b.rarity.name] - rarityMaps[a.rarity.name]
        : rarityMaps[a.rarity.name] - rarityMaps[b.rarity.name]);
}


function renderCollectibles(agents, charms, patches, musicKits, graffiti, pins) {
    const itemsBySlug = { agents, charms, patches, 'music-kits': musicKits, graffiti, pins };

    sortByRarity(agents)
    sortByRarity(charms)
    sortByRarity(patches)
    sortByRarity(musicKits)
    sortByRarity(graffiti)
    sortByRarity(pins)

    const cards = Object.entries(COLLECTIBLE_TYPES).map(([slug, { label }]) => {
        const items = itemsBySlug[slug];
        const firstImage = items[0]?.image
        return `
        <button class="weapon-card" data-collectible="${slug}">
            ${firstImage ? `<img class="weapon-card-img" src="${firstImage}" alt="${label}">` : '<div class="weapon-card-img weapon-card-img--empty"></div>'}
            <span class="weapon-card-name">${label}</span>
            <span class="weapon-card-count">${items ? items.length : ''}</span>
        </button>`;
    }).join('');

    return `
    <section id="category-collectibles">
        <h2 class="weapon-category-title">Collectibles</h2>
        <div class="weapon-grid">${cards}</div>
    </section>`;
}

const COLLECTIBLE_TYPES = {
    agents: { label: 'Agents', fetch: getAgents, csfloatParam: 'def_index' },
    charms: { label: 'Charms', fetch: getCharms, csfloatParam: 'keychain_index' },
    patches: { label: 'Patches', fetch: getPatches, csfloatParam: 'sticker_index' },
    'music-kits': { label: 'Music Kits', fetch: getMusicKits, csfloatParam: 'music_kit_index' },
    graffiti: { label: 'Graffiti', fetch: getGraffiti, csfloatParam: null }, //CSFloat doesn't sell graffiti, so there's no link for this type
    pins: { label: 'Pins', fetch: getPins, csfloatParam: 'def_index' },
};

//shows every item of one collectible type, once you've clicked into it - same card look renderCrateContentsCard uses
function renderCollectibleItems(items, label) {
    if (!items || items.length === 0) {
        return `<p class="explore-empty">Nothing found for ${label}.</p>`;
    }

    //turn COLLECTIBLE_TYPES into an array of configs, then pick out this type's csfloatParam by matching on label
    const [slug, type] = Object.entries(COLLECTIBLE_TYPES).find(([, t]) => t.label === label) ?? [];
    const csfloatParam = type?.csfloatParam;

    return items.map(item => {
        const csfloatLink = csfloatParam ? `https://csfloat.com/search?${csfloatParam}=${item.def_index}` : null;

        return `
            <div data-slug="${slug}" data-id="${item.id}" class="skin-card" style="background: ${rarityGradient(item.rarity.color)}">
                <span class="skin-rarity">${item.rarity.name}</span>
                ${item.image ? `<img class="skin-img" src="${item.image}" alt="${item.name}">` : '<div class="skin-img-placeholder"></div>'}
                <p class="skin-name">${item.name}</p>
                    <div class="skinCardPrices">
                        <p class="skinCardPriceNormal">£10 -> £20</p>
                    </div>
                    ${csfloatLink ? `<a class="csfloat-link" href="${csfloatLink}" target="_blank" rel="noopener">View on CSFloat</a>` : ''}
            </div>
        `}).join('');
}

export function renderExplorePage(weapon = null) { //if nothing is passed to weapon then weapon = null
    const app = document.getElementById('app');

    //a crate route looks like "crate/Halo Capsule" so we can tell it apart from a weapon route
    const isCrate = weapon && weapon.startsWith('crate/');
    const isGolds = isCrate && weapon.endsWith('/golds');
    const crateName = isCrate ? weapon.slice('crate/'.length).replace(/\/golds$/, '') : null;
    //a collectible route looks like "collectible/agents"
    const isCollectible = weapon && weapon.startsWith('collectible/');
    const collectibleSlug = isCollectible ? weapon.slice('collectible/'.length) : null;
    const collectibleLabel = isCollectible ? COLLECTIBLE_TYPES[collectibleSlug]?.label : null;
    const title = isCollectible ? collectibleLabel : isCrate ? crateName : weapon;

    //adds the back button and the weapon skins title if a specific weapon was selected
    app.innerHTML = `
        <div class="explore-layout">
            ${!weapon ? renderCategorySidebar() : ''}
            <div class="explore-main">
                <div class="explore-header">
                    ${weapon ? `<button class="explore-back" onclick="window.location.hash='${isGolds ? `#/explore/crate/${encodeURIComponent(crateName)}` : `#/explore` }'">← Back</button>` : ''}
                    <div class="explore-hero-row">
                        ${isCrate && !isGolds ? `<div class="case-hero" id="caseHero"></div>` : ''}
                        <div class="explore-title-row">
                            <h1 class="explore-title">${weapon ? `${isCollectible ? title : isGolds ? `${title} Golds` : isCrate ? title : `${title} Skins`}` : 'Explore Skins'}</h1>
                            ${weapon && !isCollectible ? `<button class="explore-sort-toggle" id="sortToggleBtn">${sortDescending ? 'Rarest last' : 'Rarest first'}</button>` : ''}
                        </div>
                    </div>
                </div>
                <div class="${weapon ? 'skin-grid' : 'weapon-categories'}" id="skinGrid">
                    <p class="explore-loading">Loading…</p>
                </div>
            </div>
        </div>
    `;

    if (!weapon) {
        document.querySelector('.category-sidebar')?.addEventListener('click', e => {
            const btn = e.target.closest('.category-sidebar-btn');
            if (!btn) return;
            const target = document.getElementById(btn.dataset.target);
            if (target) smoothScrollTo(target.getBoundingClientRect().top + window.scrollY);
        });
    }

    if (weapon && !isCollectible) {
        document.getElementById('sortToggleBtn')?.addEventListener('click', () => {
            sortDescending = !sortDescending;
            renderExplorePage(weapon); //re-render with the flipped sort order
        });
    }

    if (isCrate) {
        return Promise.all([getStickerCapsules(), getSouvenirPackages(), getCases(), getCollections(), getSkins()]).then(([capsules, souvenirs, cases, collections, skins]) => {
            const crate = [...capsules, ...souvenirs, ...cases, ...collections].find(c => c.name === crateName);
            const grid = document.getElementById('skinGrid');
            if (!grid) return;

            if (isGolds) {
                grid.innerHTML = renderCrateContentsCard(crate ? crate.contains_rare : [], crateName, skins); //shows just the golds for this crate
                attachSkinCardNav(grid);
                return;
            }

            const goldCount = crate && crate.contains_rare ? crate.contains_rare.length : 0;
            const goldsPreview = crate && crate.contains_rare ? crate.contains_rare.slice(0, 24) : []; //first 6 golds' own images, tiled into a mosaic instead of one static gloves/knife stand-in
            const goldsMosaic = goldsPreview.length
                ? `<div class="weapon-card-mosaic">${goldsPreview.map(g => `<img src="${g.image}" alt="${g.name}">`).join('')}</div>`
                : '<div class="weapon-card-img weapon-card-img--empty"></div>';

            const goldsCard = goldCount === 0 ? '' : `
            <button class="weapon-card weapon-card--mosaic" data-golds="${crateName}" style="background: ${rarityGradient('#ffd700')}">
                ${goldsMosaic}
                <span class="weapon-card-name">Golds</span>
                <span class="weapon-card-count">${goldCount} ${goldCount === 1 ? 'gold' : 'golds'}</span>
            </button>`;
            const hero = document.getElementById('caseHero');
            if (hero && crate) hero.innerHTML = renderCaseCard(crate);
            grid.innerHTML = goldsCard + renderCrateContentsCard(crate ? crate.contains : [], crateName, skins); //shows the golds card plus what's inside the capsule/souvenir/case/collection
            grid.addEventListener('click', e => {
                const card = e.target.closest('.weapon-card');
                if (card && card.dataset.golds) window.location.hash = '#/explore/crate/' + encodeURIComponent(crateName) + '/golds';
            });
            attachSkinCardNav(grid);
        }).catch(() => {
            const grid = document.getElementById('skinGrid');
            if (grid) grid.innerHTML = `<p class="explore-empty">Failed to load contents.</p>`;
        });
    } else if (isCollectible) {
        const type = COLLECTIBLE_TYPES[collectibleSlug];
        if (!type) return; //unknown slug in the url
        return type.fetch().then(items => {
            const grid = document.getElementById('skinGrid');
            if (!grid) return;
            grid.innerHTML = renderCollectibleItems(items, type.label);
            attachSkinCardNav(grid);
        }).catch(() => {
            const grid = document.getElementById('skinGrid');
            if (grid) grid.innerHTML = `<p class="explore-empty">Failed to load ${collectibleLabel}.</p>`;
        });
    } else if (weapon) {
        return getSkinsByWeapon(weapon).then(skins => {
            const grid = document.getElementById('skinGrid');
            if (!grid) return;
            grid.innerHTML = renderSkinCard(skins, weapon); //adds the skin name and weapon name to the skincard
            attachSkinCardNav(grid);
        }).catch(() => {
            const grid = document.getElementById('skinGrid');
            if (grid) grid.innerHTML = `<p class="explore-empty">Failed to load skins.</p>`; //if skins fail to load
        });
    } else {
        return Promise.all([getSkins(), getWeapons(), getStickerCapsules(), getSouvenirPackages(), getCases(), getCollections(), getAgents(), getCharms(), getPatches(), getMusicKits(), getGraffiti(), getPins()]).then(([skins, weaponData, capsules, souvenirs, cases, collections, agents, charms, patches, musicKits, graffiti, pins]) => { //getSkins() = skins, getWeapons() = weaponData (skins gets the skins and weaponData gets the weapons)
            const grid = document.getElementById('skinGrid');
            if (!grid) return;
            grid.innerHTML = explorePageSorting(skins, weaponData)
                + renderCrateSection(cases, 'Cases')
                + renderCrateSection(collections, 'Collections')
                + renderCrateSection(capsules, 'Sticker Capsules')
                + renderCrateSection(souvenirs, 'Souvenir Packages') //adds the weapon cards plus the capsule/souvenir/case/collection sections to the page
                + renderCollectibles(agents, charms, patches, musicKits, graffiti, pins)
                grid.addEventListener('click', e => {
                const card = e.target.closest('.weapon-card');
                if (!card) return;
                if (card.dataset.crate) window.location.hash = '#/explore/crate/' + encodeURIComponent(card.dataset.crate); //makes it so u can click on a capsule/souvenir/case/collection card
                else if (card.dataset.collectible) window.location.hash = '#/explore/collectible/' + card.dataset.collectible; //makes it so u can click into agents/charms/patches/etc
                else if (card.dataset.weapon) window.location.hash = '#/explore/' + encodeURIComponent(card.dataset.weapon); //makes it so u can click on the weapon categories
            });
        }).catch(() => {
            const grid = document.getElementById('skinGrid');
            if (grid) grid.innerHTML = `<p class="explore-empty">Failed to load skins.</p>`; //incase it fails to fetch getSkins() or getWeapons()
        });
    }
}