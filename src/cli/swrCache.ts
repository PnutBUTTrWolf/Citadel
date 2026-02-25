/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

interface CacheEntry<T> {
	data: T;
	fetchedAt: number;
	ttl: number;
}

/**
 * Stale-while-revalidate cache for CLI results.
 *
 * On a cache hit within TTL the data is returned immediately.
 * On a *stale* hit the cached value is returned and a background
 * revalidation is kicked off so the next call gets fresh data.
 */
export class SWRCache {
	private cache = new Map<string, CacheEntry<unknown>>();
	private pendingRevalidations = new Map<string, Promise<unknown>>();

	/** Remove all entries. */
	clear(): void {
		this.cache.clear();
		this.pendingRevalidations.clear();
	}

	/** Remove a single entry. */
	invalidate(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * Get from cache or fetch.
	 *
	 * @param key   Unique cache key (e.g. the CLI command string).
	 * @param ttlMs Time-to-live in milliseconds.
	 * @param fetcher Async function that produces fresh data.
	 */
	async get<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
		const entry = this.cache.get(key) as CacheEntry<T> | undefined;

		if (entry) {
			const age = Date.now() - entry.fetchedAt;

			if (age < entry.ttl) {
				return entry.data;
			}

			// Stale – return cached data but kick off background revalidation
			if (!this.pendingRevalidations.has(key)) {
				const revalidation = fetcher()
					.then((data) => {
						this.cache.set(key, { data, fetchedAt: Date.now(), ttl: ttlMs });
						return data;
					})
					.finally(() => {
						this.pendingRevalidations.delete(key);
					});
				this.pendingRevalidations.set(key, revalidation);
			}

			return entry.data;
		}

		// No cache entry at all – must await
		const data = await fetcher();
		this.cache.set(key, { data, fetchedAt: Date.now(), ttl: ttlMs });
		return data;
	}
}
