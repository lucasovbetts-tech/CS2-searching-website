export function formatSupply(n) {
    return n.toLocaleString();
}

export function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}
