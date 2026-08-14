const CURRENCY_KEY = 'wh:currency';
const RATES_KEY = 'wh:rates';
const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const RATES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let rates = null;

function loadCachedRates() {
    try {
        const cached = JSON.parse(localStorage.getItem(RATES_KEY));
        if (cached && Date.now() - cached.fetchedAt < RATES_MAX_AGE_MS) return cached.rates;
    } catch {
        return null;
    }
    return null;
}

//fetches USD-based exchange rates once (cached a day at a time - these don't need to be live-live) and
//broadcasts currencychange so any prices already on screen get reformatted with real rates once they arrive
export async function initCurrency() {
    rates = loadCachedRates();
    if (!rates) {
        try {
            const res = await fetch(RATES_URL);
            if (!res.ok) throw new Error(`Exchange rate request failed: ${res.status}`);
            const data = await res.json();
            rates = data.rates;
            localStorage.setItem(RATES_KEY, JSON.stringify({ rates, fetchedAt: Date.now() }));
        } catch (err) {
            console.warn('Failed to load exchange rates, prices will show in USD:', err.message);
            return;
        }
    }
    document.dispatchEvent(new CustomEvent('currencychange'));
}

export function getCurrency() {
    return localStorage.getItem(CURRENCY_KEY) || 'USD';
}

export function setCurrency(code) {
    localStorage.setItem(CURRENCY_KEY, code);
    document.dispatchEvent(new CustomEvent('currencychange'));
}

function rateFor(code) {
    return code === 'USD' ? 1 : (rates?.[code] ?? 1);
}

export function convert(usd, code = getCurrency()) {
    return usd * rateFor(code);
}

export function toUsd(amount, code = getCurrency()) {
    return amount / rateFor(code);
}

export function formatPrice(usd) {
    const code = getCurrency();
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(convert(usd, code));
}

//wraps a formatted price in a span carrying its raw USD value, so the currencychange listener below can
//reformat it in place later without needing to re-fetch or re-render anything else around it
export function priceSpan(usd, fallback = 'N/A') {
    return usd == null ? `<span data-usd="">${fallback}</span>` : `<span data-usd="${usd}">${formatPrice(usd)}</span>`;
}

//same idea as priceSpan, for prices set imperatively on an existing element rather than built into a template
export function applyPrice(el, usd) {
    if (!el) return;
    el.dataset.usd = usd == null ? '' : usd;
    el.textContent = usd == null ? 'N/A' : formatPrice(usd);
}

//reformats every price on the page in place whenever the currency changes (or rates finish loading) -
//dataset.usd is the source of truth, so this never needs to touch layout or re-fetch anything
document.addEventListener('currencychange', () => {
    document.querySelectorAll('[data-usd]').forEach(el => {
        if (el.dataset.usd === '') return;
        el.textContent = formatPrice(Number(el.dataset.usd));
    });
});
