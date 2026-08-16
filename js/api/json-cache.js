//Caches the in-flight promise, not the resolved value. Several pages request the same file at the
//same time (search.js and explore.js both want skins.json on load, every skin card wants prices),
//and caching only the result means each of those concurrent callers sees an empty cache and starts
//its own download of the same multi-megabyte file.
//
//A rejected promise is evicted so a failed load can be retried rather than replaying the error forever.
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
