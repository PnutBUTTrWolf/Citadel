/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { GtClient, type DaemonHealth, type DoltHealth } from '../gtClient';
import type { TierHealth } from '../cli/contracts';

export class HealthTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private watchers: vscode.FileSystemWatcher[] = [];

	constructor(private readonly client: GtClient) {
		this.setupFileWatchers();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (element) {
			return [];
		}

		const [health, dolt, agents, rigs] = await Promise.all([
			this.client.getDaemonHealth(),
			this.client.getDoltHealth(),
			this.client.getAgents(),
			this.client.getRigs(),
		]);
		const issues = this.client.getDaemonIssues(health);

		return this.buildItems(health, dolt, issues.length, agents.length, rigs.length);
	}

	private buildItems(
		health: DaemonHealth,
		dolt: DoltHealth,
		issueCount: number,
		agentCount: number,
		rigCount: number,
	): vscode.TreeItem[] {
		const items: vscode.TreeItem[] = [];

		// --- Tier: Daemon ---
		const daemonHealth: TierHealth = !health.running ? 'down'
			: health.staleHeartbeat ? 'degraded'
				: 'healthy';
		const daemonDetail = health.running
			? (health.pid ? `PID ${health.pid}` : 'running')
			: 'not running';
		items.push(this.makeTierItem('Daemon', daemonHealth, daemonDetail));

		// --- Tier: Dolt Database ---
		const doltUp = dolt.port3306 || dolt.port3307;
		const doltFull = dolt.port3306 && dolt.port3307;
		const doltPartial = doltUp && !doltFull;
		let doltDetail: string;
		if (doltFull) {
			doltDetail = dolt.pid ? `PID ${dolt.pid}` : 'bd + gt OK';
		} else if (doltPartial) {
			const up = dolt.port3306 ? 'bd' : 'gt';
			const down = dolt.port3306 ? 'gt' : 'bd';
			doltDetail = `${up} OK, ${down} down`;
		} else {
			doltDetail = 'not reachable';
		}
		const doltHealth: TierHealth = !doltUp ? 'down' : doltPartial ? 'degraded' : 'healthy';
		items.push(this.makeTierItem('Dolt Database', doltHealth, doltDetail));

		// --- Tier: Boot Monitor ---
		const otherCrashLoops = health.crashLoops.filter(cl => cl.agent !== 'deacon');
		const bootHealth: TierHealth = otherCrashLoops.length > 0 ? 'degraded' : 'healthy';
		const bootDetail = otherCrashLoops.length > 0
			? `${otherCrashLoops.length} crash loop(s)`
			: 'OK';
		items.push(this.makeTierItem('Boot Monitor', bootHealth, bootDetail));

		// --- Tier: Deacon ---
		const deaconCrashLoop = health.crashLoops.find(cl => cl.agent === 'deacon');
		const deaconHealth: TierHealth = deaconCrashLoop ? 'degraded'
			: health.staleAgentConfig ? 'degraded'
				: 'healthy';
		const deaconDetail = deaconCrashLoop ? `crash loop (${deaconCrashLoop.restartCount}x)`
			: health.staleAgentConfig ? 'stale agent config'
				: 'OK';
		items.push(this.makeTierItem('Deacon', deaconHealth, deaconDetail));

		// --- System summary ---
		const sysItem = new vscode.TreeItem('System', vscode.TreeItemCollapsibleState.None);
		sysItem.description = `${agentCount} agents, ${rigCount} rigs`;
		sysItem.iconPath = new vscode.ThemeIcon('server');
		items.push(sysItem);

		// --- Issues warning ---
		if (issueCount > 0) {
			const issueItem = new vscode.TreeItem(
				`${issueCount} issue${issueCount > 1 ? 's' : ''} detected`,
				vscode.TreeItemCollapsibleState.None,
			);
			issueItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
			issueItem.command = {
				command: 'citadel.repairDaemon',
				title: 'Repair Daemon',
			};
			issueItem.tooltip = 'Click to repair';
			items.push(issueItem);
		}

		return items;
	}

	private makeTierItem(label: string, health: TierHealth, detail: string): vscode.TreeItem {
		const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
		item.description = detail;
		item.iconPath = HealthTreeProvider.getTierIcon(health);
		item.tooltip = `${label}: ${health}\n${detail}`;
		return item;
	}

	private static getTierIcon(health: TierHealth): vscode.ThemeIcon {
		switch (health) {
			case 'healthy':
				return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
			case 'degraded':
				return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
			case 'down':
				return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
		}
	}

	private setupFileWatchers(): void {
		const wsPath = this.client.getWorkspacePath();
		const daemonDir = path.join(wsPath, 'daemon');

		try {
			const statePattern = new vscode.RelativePattern(
				vscode.Uri.file(daemonDir), 'state.json',
			);
			const restartPattern = new vscode.RelativePattern(
				vscode.Uri.file(daemonDir), 'restart_state.json',
			);

			const w1 = vscode.workspace.createFileSystemWatcher(statePattern);
			const w2 = vscode.workspace.createFileSystemWatcher(restartPattern);

			const onFileChange = () => this.refresh();
			w1.onDidChange(onFileChange);
			w1.onDidCreate(onFileChange);
			w2.onDidChange(onFileChange);
			w2.onDidCreate(onFileChange);

			this.watchers.push(w1, w2);
		} catch {
			// fs watcher may fail if daemon dir doesn't exist yet
		}
	}

	dispose(): void {
		for (const w of this.watchers) {
			w.dispose();
		}
		this.watchers = [];
	}
}
