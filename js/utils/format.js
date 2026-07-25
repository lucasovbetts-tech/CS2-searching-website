export function formatSupply(n) {
    return n.toLocaleString();
}

export function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
