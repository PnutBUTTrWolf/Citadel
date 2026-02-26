/*---------------------------------------------------------------------------------------------
 *  Test helpers and mock factories for integration tests.
 *
 *  Provides a MockGtClient that satisfies the GtClient interface at runtime
 *  without making real CLI calls, plus factory functions for test data.
 *--------------------------------------------------------------------------------------------*/

import type {
	GtAgent,
	GtBead,
	GtConvoy,
	GtRig,
	GtMayorStatus,
	DaemonHealth,
	DaemonIssue,
} from '../../gtClient';
import type { GtMailMessage, GtMergeQueueItem } from '../../cli/contracts';

/**
 * A mock GtClient that records method calls and returns configurable data.
 * Use `as any` when passing to providers/managers that expect a real GtClient.
 */
export class MockGtClient {
	agents: GtAgent[] = [];
	beads: GtBead[] = [];
	convoys: GtConvoy[] = [];
	rigs: GtRig[] = [];
	calls: { method: string; args: unknown[] }[] = [];

	async getAgents(): Promise<GtAgent[]> {
		this.calls.push({ method: 'getAgents', args: [] });
		return this.agents;
	}

	async getWorkerAgents(): Promise<GtAgent[]> {
		const all = await this.getAgents();
		return all.filter(a => !MockGtClient.isInfrastructureRole(a.role));
	}

	async getInfrastructureAgents(): Promise<GtAgent[]> {
		const all = await this.getAgents();
		return all.filter(a => MockGtClient.isInfrastructureRole(a.role));
	}

	async listBeads(_options?: { noParent?: boolean; status?: string; all?: boolean; parent?: string }): Promise<GtBead[]> {
		this.calls.push({ method: 'listBeads', args: [_options] });
		return this.beads;
	}

	async getConvoys(): Promise<GtConvoy[]> {
		this.calls.push({ method: 'getConvoys', args: [] });
		return this.convoys;
	}

	async getRigs(): Promise<GtRig[]> {
		this.calls.push({ method: 'getRigs', args: [] });
		return this.rigs;
	}

	getWorkspacePath(): string { return '/tmp/test-workspace'; }
	getGtPath(): string { return '/usr/bin/true'; }
	getClaudeEnv(): Record<string, string> { return {}; }

	async slingBead(beadId: string, rig: string, agentOverride?: string): Promise<string> {
		this.calls.push({ method: 'slingBead', args: [beadId, rig, agentOverride] });
		return 'ok';
	}

	async createBead(title: string): Promise<string> {
		this.calls.push({ method: 'createBead', args: [title] });
		return 'ct-test1';
	}

	async showBead(beadId: string): Promise<string> {
		this.calls.push({ method: 'showBead', args: [beadId] });
		return `Title: Test Bead\nStatus: open\nAssignee: polecat-1\n\nTest description body`;
	}

	async deleteBead(beadId: string): Promise<string> {
		this.calls.push({ method: 'deleteBead', args: [beadId] });
		return 'ok';
	}

	async isDoltRunning(_port?: number): Promise<boolean> { return true; }
	async startDolt(): Promise<string> { return 'ok'; }
	async stopDolt(): Promise<void> {}

	async getDaemonHealth(): Promise<DaemonHealth> {
		return { running: true, staleHeartbeat: false, crashLoops: [], staleAgentConfig: false };
	}

	getDaemonIssues(_health: DaemonHealth): DaemonIssue[] {
		return [];
	}

	async repairDaemon(): Promise<string[]> { return []; }

	async getMayorStatus(): Promise<GtMayorStatus> {
		return { running: false, attached: false };
	}

	async syncClaudeWrapper(): Promise<string | undefined> { return undefined; }

	async getMailInbox(): Promise<GtMailMessage[]> { return []; }
	async sendMail(): Promise<string> { return 'ok'; }
	async getMergeQueue(): Promise<GtMergeQueueItem[]> { return []; }

	reload(): void {}
	dispose(): void {}

	static isInfrastructureRole(role: string): boolean {
		return new Set([
			'mayor', 'deacon', 'witness', 'refinery', 'dog',
			'coordinator', 'health-check',
		]).has(role);
	}

	static readonly INFRASTRUCTURE_ROLES = new Set([
		'mayor', 'deacon', 'witness', 'refinery', 'dog',
		'coordinator', 'health-check',
	]);

	resetCalls(): void {
		this.calls = [];
	}

	wasCalled(method: string): boolean {
		return this.calls.some(c => c.method === method);
	}

	callsFor(method: string): { method: string; args: unknown[] }[] {
		return this.calls.filter(c => c.method === method);
	}
}

// --- Factory functions for test data ---

export function makeAgent(overrides: Partial<GtAgent> = {}): GtAgent {
	return {
		name: 'test-agent',
		status: 'active',
		displayStatus: 'running',
		rig: 'test-rig',
		role: 'polecat',
		running: true,
		hasWork: true,
		...overrides,
	};
}

export function makeBead(overrides: Partial<GtBead> = {}): GtBead {
	return {
		id: 'ct-test1',
		title: 'Test bead',
		status: 'pending',
		...overrides,
	};
}

export function makeConvoy(overrides: Partial<GtConvoy> = {}): GtConvoy {
	return {
		id: 'cv-test1',
		title: 'Test convoy',
		tracked: [],
		status: 'active',
		progress: { completed: 0, total: 0 },
		...overrides,
	};
}

export function makeRig(overrides: Partial<GtRig> = {}): GtRig {
	return {
		name: 'test-rig',
		repoUrl: 'https://github.com/test/test.git',
		hooks: [],
		crewMembers: [],
		...overrides,
	};
}
