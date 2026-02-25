/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Trips after repeated CLI failures to avoid hammering an unavailable backend.
 *
 * CLOSED  -> normal, requests pass through
 * OPEN    -> too many failures, requests fail fast
 * HALF_OPEN -> testing recovery; 2 successes close, 1 failure re-opens
 */
export class CircuitBreaker {
	private state: CircuitState = 'CLOSED';
	private failureCount = 0;
	private lastFailureTime = 0;
	private successCount = 0;
	private readonly halfOpenSuccessThreshold = 2;

	constructor(
		private readonly threshold: number = 5,
		private readonly resetTimeMs: number = 60_000,
	) {}

	canExecute(): boolean {
		if (this.state === 'CLOSED') {
			return true;
		}

		if (this.state === 'OPEN') {
			if (Date.now() - this.lastFailureTime >= this.resetTimeMs) {
				this.state = 'HALF_OPEN';
				this.successCount = 0;
				return true;
			}
			return false;
		}

		// HALF_OPEN
		return true;
	}

	recordSuccess(): void {
		if (this.state === 'HALF_OPEN') {
			this.successCount++;
			if (this.successCount >= this.halfOpenSuccessThreshold) {
				this.reset();
			}
		} else if (this.state === 'CLOSED') {
			this.failureCount = 0;
		}
	}

	recordFailure(): void {
		this.failureCount++;
		this.lastFailureTime = Date.now();

		if (this.state === 'HALF_OPEN') {
			this.state = 'OPEN';
			return;
		}

		if (this.failureCount >= this.threshold) {
			this.state = 'OPEN';
		}
	}

	reset(): void {
		this.state = 'CLOSED';
		this.failureCount = 0;
		this.successCount = 0;
		this.lastFailureTime = 0;
	}

	getState(): CircuitState {
		return this.state;
	}

	getStats(): { state: CircuitState; failureCount: number; successCount: number; lastFailureTime: number } {
		return {
			state: this.state,
			failureCount: this.failureCount,
			successCount: this.successCount,
			lastFailureTime: this.lastFailureTime,
		};
	}
}
