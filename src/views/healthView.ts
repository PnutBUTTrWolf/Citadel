/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, type DaemonHealth, type DoltHealth } from '../gtClient';

export class HealthTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly client: GtClient) {}

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

		// Daemon status
		const daemonItem = new vscode.TreeItem('Daemon', vscode.TreeItemCollapsibleState.None);
		daemonItem.description = health.running
			? (health.pid ? `PID ${health.pid}` : 'running')
			: 'down';
		daemonItem.iconPath = health.running
			? new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'))
			: new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
		items.push(daemonItem);

		// Dolt status — two servers: bd (3306) and gt (3307)
		const doltUp = dolt.port3306 || dolt.port3307;
		const doltFull = dolt.port3306 && dolt.port3307;
		const doltItem = new vscode.TreeItem('Dolt', vscode.TreeItemCollapsibleState.None);
		doltItem.description = doltFull
			? (dolt.pid ? `PID ${dolt.pid}` : 'OK')
			: doltUp
				? `partial (${dolt.port3306 ? 'bd' : 'gt'} only)`
				: 'down';
		doltItem.iconPath = doltFull
			? new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'))
			: doltUp
				? new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'))
				: new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
		items.push(doltItem);

		// System summary
		const sysItem = new vscode.TreeItem('System', vscode.TreeItemCollapsibleState.None);
		sysItem.description = `${agentCount} agents, ${rigCount} rigs`;
		sysItem.iconPath = new vscode.ThemeIcon('server');
		items.push(sysItem);

		// Issues warning
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

		// Crash loops
		for (const cl of health.crashLoops) {
			const clItem = new vscode.TreeItem(
				`${cl.agent}: crash loop`,
				vscode.TreeItemCollapsibleState.None,
			);
			clItem.description = `${cl.restartCount}x`;
			clItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
			items.push(clItem);
		}

		return items;
	}
}
