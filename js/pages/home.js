import { renderSearchSection, initSearch } from '../components/search.js';

export function renderHome() {
    document.getElementById('app').innerHTML = renderSearchSection();
    initSearch();
    window.addEventListener('resize', () => {
        import('../components/search.js').then(m => m.syncSearchWidth());
    }, { once: false });
}
