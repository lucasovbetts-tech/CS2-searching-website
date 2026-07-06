import { renderHome }          from './pages/home.js';
import { renderInventory }     from './pages/inventory.js';
import { renderTradeup }       from './pages/tradeup.js';
import { renderExplorePage }   from './pages/explore.js';
import { renderCaseSimulator } from './pages/case-simulator.js';
import { renderSkinDetail }    from './pages/skin-detail.js';
import { renderStickerDetail } from './pages/sticker-detail.js';
import { renderCollectibleDetail } from './pages/collectible-detail.js';

const ROUTES = {
    '':               renderHome,
    '/':              renderHome,
    'home':           renderHome,
    'inventory':      renderInventory,
    'tradeup':        renderTradeup,
    'explore':        renderExplorePage,
    'case-simulator': renderCaseSimulator,
    'skin':           renderSkinDetail,
    'sticker':        renderStickerDetail,
    'collectible':    renderCollectibleDetail,
};

function getRoute() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash.split('/')[0];
}

function getRouteParam() {
    const parts = window.location.hash.replace(/^#\/?/, '').split('/');
    return parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : null;
}

function updateActiveNav(route) {
    document.querySelectorAll('.nav-btn[data-route]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.route === route);
    });
}

window.addEventListener("scroll", () => {
  localStorage.setItem('scroll:' + window.location.hash, window.scrollY);
});

let forceTop = false; //set right before a nav-bar click changes the hash, so navigate() knows to skip restoring scroll

function navigate() {
    const route  = getRoute();
    const param  = getRouteParam();
    const render = ROUTES[route] ?? renderHome;
    const hash   = window.location.hash; //capture now, in case it changes again before render finishes
    const result = render(param); //render is for example "renderHome" and param is for example "AK-47"
    updateActiveNav(route);

    const skipRestore = forceTop;
    forceTop = false; //reset immediately so it only applies to this one navigation

    //Promise.resolve on a non-promise (what the synchronous pages return) resolves immediately,
    //so this waits for real content on async pages (explore.js) without guessing at timing
    Promise.resolve(result).then(() => {
        if (skipRestore) { scrollTo(0, 0); return; } //nav-bar click: always start at the top of the section
        const saved = localStorage.getItem('scroll:' + hash);
        scrollTo(0, saved ? Number(saved) : 0);
    });
}

//changes the page
export function initRouter() {
    // Wire nav buttons to hash navigation
    document.querySelectorAll('.nav-btn[data-route]').forEach(btn => {
        btn.addEventListener('click', () => {
            forceTop = true;
            window.location.hash = '/' + btn.dataset.route;
        });
    });

    window.addEventListener('hashchange', navigate);
    navigate();
}