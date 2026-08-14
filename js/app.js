import { initHeader } from './components/header.js';
import { initRouter } from './router.js';
import { initCurrency } from './utils/currency.js';

function init() {
    initCurrency();
    initHeader();
    initRouter();
}

init();
