/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export interface CLICommandConfig {
	command: string;
	args: string[];
	timeout?: number;
	cwd?: string;
	/** Set false to disable deduplication for this request. Defaults to true. */
	dedupe?: boolean;
}

interface QueuedRequest<T> {
	config: CLICommandConfig;
	resolve: (result: T) => void;
	reject: (error: Error) => void;
}

/**
 * Limits the number of concurrent CLI processes and deduplicates
 * identical in-flight requests.
 */
export class ConcurrencyLimiter {
	private queue: QueuedRequest<unknown>[] = [];
	private inFlight = new Map<string, Promise<unknown>>();
	private activeCount = 0;

	constructor(private readonly maxConcurrency: number = 4) {}

	private getDedupeKey(config: CLICommandConfig): string {
		return `${config.command}:${config.args.join(':')}`;
	}

	async execute<T>(
		config: CLICommandConfig,
		executor: (cfg: CLICommandConfig) => Promise<T>,
	): Promise<T> {
		if (config.dedupe !== false) {
			const key = this.getDedupeKey(config);
			const existing = this.inFlight.get(key);
			if (existing) {
				return existing as Promise<T>;
			}
		}

		return new Promise<T>((resolve, reject) => {
			const request: QueuedRequest<T> = { config, resolve, reject };
			this.queue.push(request as QueuedRequest<unknown>);
			this.processQueue(executor as (cfg: CLICommandConfig) => Promise<unknown>);
		});
	}

	private processQueue(executor: (cfg: CLICommandConfig) => Promise<unknown>): void {
		while (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
			const request = this.queue.shift();
			if (!request) { continue; }

			this.activeCount++;
			const key = this.getDedupeKey(request.config);

			const promise = executor(request.config)
				.then((result) => {
					request.resolve(result);
					return result;
				})
				.catch((error) => {
					request.reject(error);
					throw error;
				})
				.finally(() => {
					this.activeCount--;
					this.inFlight.delete(key);
					this.processQueue(executor);
				});

			if (request.config.dedupe !== false) {
				this.inFlight.set(key, promise);
			}
		}
	}

	getStats(): { queued: number; active: number; maxConcurrency: number } {
		return {
			queued: this.queue.length,
			active: this.activeCount,
			maxConcurrency: this.maxConcurrency,
		};
	}

	clear(): void {
		for (const request of this.queue) {
			request.reject(new Error('Queue cleared'));
		}
		this.queue = [];
		this.inFlight.clear();
	}
}
