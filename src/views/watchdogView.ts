/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { GtClient } from '../gtClient';
import type { WatchdogTier, TierHealth } from '../cli/contracts';

interface TierStatus {
	tier: WatchdogTier;
	label: string;
	health: TierHealth;
	detail?: string;
}

export class WatchdogTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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

	async getChildren(): Promise<vscode.TreeItem[]> {
		const [health, dolt] = await Promise.all([
			this.client.getDaemonHealth(),
			this.client.getDoltHealth(),
		]);

		const deaconCrashLoop = health.crashLoops.find(cl => cl.agent === 'deacon');
		const otherCrashLoops = health.crashLoops.filter(cl => cl.agent !== 'deacon');

		const doltUp = dolt.port3306 || dolt.port3307;
		const doltPartial = doltUp && !(dolt.port3306 && dolt.port3307);
		let doltDetail: string;
		if (dolt.port3306 && dolt.port3307) {
			doltDetail = dolt.pid ? `PID ${dolt.pid}` : 'bd + gt OK';
		} else if (doltPartial) {
			const up = dolt.port3306 ? 'bd' : 'gt';
			const down = dolt.port3306 ? 'gt' : 'bd';
			doltDetail = `${up} OK, ${down} down`;
		} else {
			doltDetail = 'not reachable';
		}

		const tiers: TierStatus[] = [
			{
				tier: 'daemon',
				label: 'Daemon',
				health: !health.running ? 'down'
					: health.staleHeartbeat ? 'degraded'
						: 'healthy',
				detail: health.running
					? (health.pid ? `PID ${health.pid}` : 'running')
					: 'not running',
			},
			{
				tier: 'dolt',
				label: 'Dolt Database',
				health: !doltUp ? 'down' : doltPartial ? 'degraded' : 'healthy',
				detail: doltDetail,
			},
			{
				tier: 'boot',
				label: 'Boot Monitor',
				health: otherCrashLoops.length > 0 ? 'degraded' : 'healthy',
				detail: otherCrashLoops.length > 0
					? `${otherCrashLoops.length} crash loop(s)`
					: 'OK',
			},
			{
				tier: 'deacon',
				label: 'Deacon',
				health: deaconCrashLoop ? 'degraded'
					: health.staleAgentConfig ? 'degraded'
						: 'healthy',
				detail: deaconCrashLoop ? `crash loop (${deaconCrashLoop.restartCount}x)`
					: health.staleAgentConfig ? 'stale agent config'
						: 'OK',
			},
		];

		return tiers.map(t => new TierTreeItem(t));
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

class TierTreeItem extends vscode.TreeItem {
	constructor(status: TierStatus) {
		super(status.label, vscode.TreeItemCollapsibleState.None);

		this.description = status.detail;
		this.iconPath = TierTreeItem.getIcon(status.health);
		this.tooltip = `${status.label}: ${status.health}\n${status.detail || ''}`;
		this.contextValue = `watchdog-${status.tier}`;
	}

	private static getIcon(health: TierHealth): vscode.ThemeIcon {
		switch (health) {
			case 'healthy':
				return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
			case 'degraded':
				return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
			case 'down':
				return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
		}
	}
}
