//returns a promise of the cached json file
export function cachedJson(url, errorMessage) {
    let promise = null;
    return () => {
        if (!promise) {
            promise = fetch(url)
                .then(res => {
                    if (!res.ok) throw new Error(errorMessage);
                    return res.json();
                })
                .catch(err => { promise = null; throw err; });
        }
        return promise;
    };
}