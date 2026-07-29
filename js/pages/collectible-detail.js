import { getAgents, getCharms, getPatches, getMusicKits, getGraffiti, getPins } from '../api/collectibles.js';
import { getHighlights } from '../api/highlights.js';
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

//"de_mirage" -> "Mirage" - strips the mode prefix maps are stored with, for display only
function formatMapName(map) {
    return map.replace(/^[a-z]+_/, '').replace(/^./, c => c.toUpperCase());
}


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

function renderHighlightVideo(item) {
    if (!item.video) return '';
    return `
        <div class="highlight-video-wrap">
            <video class="highlight-video" src="${item.video}" poster="${item.thumbnail ?? item.image ?? ''}" controls></video>
        </div>
    `;
}

//match context shown only for highlights - tournament/stage/map/player/teams, nothing else has these fields
function renderHighlightMeta(item) {
    return `
        <div class="highlight-meta">
            <div class="highlight-meta-item">
                <span class="highlight-meta-label">Tournament</span>
                <span class="highlight-meta-value">${item.tournament_event}</span>
            </div>
            <div class="highlight-meta-item">
                <span class="highlight-meta-label">Stage</span>
                <span class="highlight-meta-value">${item.stage}</span>
            </div>
            <div class="highlight-meta-item">
                <span class="highlight-meta-label">Map</span>
                <span class="highlight-meta-value">${formatMapName(item.map)}</span>
            </div>
            <div class="highlight-meta-item">
                <span class="highlight-meta-label">Player</span>
                <span class="highlight-meta-value">${item.tournament_player}</span>
            </div>
            <div class="highlight-meta-item highlight-meta-item--wide">
                <span class="highlight-meta-label">Teams</span>
                <span class="highlight-meta-value">${item.team0}<span class="highlight-meta-vs">vs</span>${item.team1}</span>
            </div>
        </div>
    `;
}

const PRICE_UNAVAILABLE = 'Price unavailable. (Not found in cache)';

//cheapest market found for the item - no wear tiers/variants for these types, just one price per market.
//each market's value is {price, link}
function lowestPrice(prices) {
    if (!prices) return PRICE_UNAVAILABLE;
    const values = Object.values(prices);
    if (!values.length) return PRICE_UNAVAILABLE;
    return `From $${Math.min(...values.map(v => v.price)).toFixed(2)}`;
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

//kept in sync by hand with explore.js's COLLECTIBLE_TYPES - same slugs, fetches, and csfloat query params
const COLLECTIBLE_TYPES = {
    agents: { fetch: getAgents, csfloatParam: 'def_index' },
    charms: { fetch: getCharms, csfloatParam: 'keychain_index' },
    patches: { fetch: getPatches, csfloatParam: 'sticker_index' },
    'music-kits': { fetch: getMusicKits, csfloatParam: 'music_kit_index' },
    graffiti: { fetch: getGraffiti, csfloatParam: null }, //CSFloat doesn't sell graffiti, so there's no link for this type
    pins: { fetch: getPins, csfloatParam: 'def_index' },
    highlights: { fetch: getHighlights, csfloatParam: null },
};

//renders the page for one specific collectible item, routed to as "#/collectible/<slug>/<id>"
export function renderCollectibleDetail(param) {
    const [slug, id] = (param || '').split('/');
    const app = document.getElementById('app');

    app.innerHTML = `
        <div class="skin-detail-page">
            <p class="explore-loading">Loading…</p>
        </div>
    `;

    const type = COLLECTIBLE_TYPES[slug];
    if (!type) {
        app.innerHTML = `
            <div class="skin-detail-page">
                <button class="explore-back" onclick="window.history.back()">← Back</button>
                <p class="explore-empty">Unknown collectible type.</p>
            </div>`;
        return;
    }

    return Promise.all([type.fetch(), getItemPrice(id), getMarkets()]).then(([items, prices, markets]) => {
        const container = document.querySelector('.skin-detail-page');
        if (!container) return;

        const item = items.find(i => i.id === id);

        if (!item) {
            container.innerHTML = `
                <button class="explore-back" onclick="window.history.back()">← Back</button>
                <p class="explore-empty">Item not found.</p>`;
            return;
        }

        const csfloatLink = type.csfloatParam ? `https://csfloat.com/search?type=buy_now&${type.csfloatParam}=${item.defIndex ?? item.def_index}` : null;

        container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <div class="skin-detail-layout">
                <div class="skin-detail-media">
                    <div class="skin-detail-art" style="background: ${rarityGradient(item.rarity?.color ?? '#a855f7')}">
                        ${item.rarity ? `<span class="skin-rarity">${item.rarity.name}</span>` : ''}
                        ${item.image ? `<img class="skin-detail-img" src="${item.image}" alt="${item.name}">` : '<div class="skin-img-placeholder"></div>'}
                    </div>
                    ${renderMarketListings(prices, markets)}
                </div>
                <div class="skin-detail-info">
                    <h1 class="skin-detail-name">${slug === 'agents' ? item.marketHashName : item.name}</h1>
                    ${item.description ? `<p class="skin-detail-desc">${item.description.replace(/\\n/g, '<br><br>')}</p>` : ''}
                    ${slug === 'highlights' ? renderHighlightMeta(item) : ''}
                    ${renderDetailStats(item)}
                    <p class="skin-detail-desc">${lowestPrice(prices)}</p>
                    ${csfloatLink ? `<a class="csfloat-link" href="${csfloatLink}" target="_blank" rel="noopener">View on CSFloat</a>` : ''}
                    ${renderCrates(item)}
                </div>
            </div>
            ${slug === 'highlights' ? renderHighlightVideo(item) : ''}
        `;
        //volume has no HTML attribute equivalent - has to be set on the element itself once it exists
        const video = container.querySelector('video');
        if (video) video.volume = 0.1;
    }).catch(() => {
        const container = document.querySelector('.skin-detail-page');
        if (container) container.innerHTML = `
            <button class="explore-back" onclick="window.history.back()">← Back</button>
            <p class="explore-empty">Failed to load item.</p>`;
    });
}