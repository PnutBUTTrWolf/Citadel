/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { execFile, type ChildProcess } from 'child_process';
import { CircuitBreaker } from './circuitBreaker';
import { ConcurrencyLimiter, type CLICommandConfig } from './concurrencyLimiter';
import { getEnvWithPath, resolveCommand } from './env';
import { DEFAULT_CLI_TIMEOUT } from '../constants';

export interface CLIResult<T> {
	success: boolean;
	data: T | null;
	error: string | null;
	exitCode: number;
	duration: number;
	command: string;
}

export interface ProcessSupervisorConfig {
	defaultTimeout: number;
	maxConcurrency: number;
	circuitBreakerThreshold: number;
	circuitBreakerResetTime: number;
}

const DEFAULT_SUPERVISOR_CONFIG: ProcessSupervisorConfig = {
	defaultTimeout: DEFAULT_CLI_TIMEOUT,
	maxConcurrency: 4,
	circuitBreakerThreshold: 5,
	circuitBreakerResetTime: 15_000,
};

/**
 * Safe, observable CLI execution with circuit breaker, concurrency limiting,
 * and request deduplication.  Uses `execFile` (no shell) for security.
 */
export class ProcessSupervisor {
	private readonly config: ProcessSupervisorConfig;
	private readonly limiter: ConcurrencyLimiter;
	readonly circuitBreaker: CircuitBreaker;
	private readonly activeProcesses = new Map<string, ChildProcess>();
	private totalSpawned = 0;
	private destroyed = false;

	constructor(config: Partial<ProcessSupervisorConfig> = {}) {
		this.config = { ...DEFAULT_SUPERVISOR_CONFIG, ...config };
		this.limiter = new ConcurrencyLimiter(this.config.maxConcurrency);
		this.circuitBreaker = new CircuitBreaker(
			this.config.circuitBreakerThreshold,
			this.config.circuitBreakerResetTime,
		);
	}

	async execute<T>(commandConfig: CLICommandConfig): Promise<CLIResult<T>> {
		if (this.destroyed) {
			return this.failResult<T>('Process supervisor has been destroyed', commandConfig);
		}

		if (!this.circuitBreaker.canExecute()) {
			return this.failResult<T>('Circuit breaker is open — CLI is unavailable', commandConfig);
		}

		return this.limiter.execute(commandConfig, (cfg) => this.executeCommand<T>(cfg));
	}

	private executeCommand<T>(config: CLICommandConfig): Promise<CLIResult<T>> {
		return new Promise((resolve) => {
			const startTime = Date.now();
			const timeout = config.timeout ?? this.config.defaultTimeout;
			const command = this.formatCommand(config);
			const processId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

			this.totalSpawned++;

		const child = execFile(
			resolveCommand(config.command),
			config.args,
				{
					timeout,
					maxBuffer: 10 * 1024 * 1024,
					cwd: config.cwd,
					env: { ...getEnvWithPath(), GT_OUTPUT: 'json' },
				},
				(error, stdout, stderr) => {
					this.activeProcesses.delete(processId);
					const duration = Date.now() - startTime;

					if (error) {
						this.circuitBreaker.recordFailure();
						const execError = error as NodeJS.ErrnoException & { killed?: boolean };
						const isTimeout = execError.killed || error.message.includes('ETIMEDOUT');
						const errorMessage = execError.killed
							? 'Process was killed'
							: isTimeout
								? `Command timed out after ${timeout}ms`
								: stderr || error.message;

						resolve({
							success: false,
							data: null,
							error: errorMessage,
							exitCode: typeof (error as any).code === 'number' ? (error as any).code : -1,
							duration,
							command,
						});
						return;
					}

					this.circuitBreaker.recordSuccess();

					let data: T | null = null;
					try {
						data = JSON.parse(stdout) as T;
					} catch {
						data = stdout as unknown as T;
					}

					resolve({ success: true, data, error: null, exitCode: 0, duration, command });
				},
			);

			this.activeProcesses.set(processId, child);

			child.on('error', (err) => {
				this.activeProcesses.delete(processId);
				this.circuitBreaker.recordFailure();
				resolve({
					success: false,
					data: null,
					error: `Failed to spawn process: ${err.message}`,
					exitCode: -1,
					duration: Date.now() - startTime,
					command,
				});
			});
		});
	}

	gt<T = unknown>(args: string[], opts: Partial<CLICommandConfig> = {}): Promise<CLIResult<T>> {
		return this.execute<T>({ command: 'gt', args, ...opts });
	}

	bd<T = unknown>(args: string[], opts: Partial<CLICommandConfig> = {}): Promise<CLIResult<T>> {
		return this.execute<T>({ command: 'bd', args, ...opts });
	}

	getStats() {
		return {
			queue: this.limiter.getStats(),
			circuitBreaker: this.circuitBreaker.getStats(),
			processes: { active: this.activeProcesses.size, totalSpawned: this.totalSpawned },
		};
	}

	resetCircuitBreaker(): void {
		this.circuitBreaker.reset();
	}

	destroy(): void {
		this.destroyed = true;
		for (const [id, proc] of this.activeProcesses) {
			proc.kill('SIGKILL');
			this.activeProcesses.delete(id);
		}
		this.limiter.clear();
	}

	isDestroyed(): boolean {
		return this.destroyed;
	}

	private formatCommand(config: CLICommandConfig): string {
		return `${config.command} ${config.args.join(' ')}`;
	}

	private failResult<T>(error: string, config: CLICommandConfig): CLIResult<T> {
		return { success: false, data: null, error, exitCode: -1, duration: 0, command: this.formatCommand(config) };
	}
}
