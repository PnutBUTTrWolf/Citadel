/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, GtMayorStatus } from '../gtClient';

export class MayorTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private _status: GtMayorStatus = { running: false, attached: false };

	constructor(private readonly client: GtClient) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	updateStatus(status: GtMayorStatus): void {
		this._status = status;
		this._onDidChangeTreeData.fire();
	}

	async refreshFromCli(): Promise<void> {
		this.updateStatus(await this.client.getMayorStatus());
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<vscode.TreeItem[]> {
		const status = this._status;

		let label: string;
		let icon: vscode.ThemeIcon;
		if (status.running && status.attached) {
			label = 'Running (attached)';
			icon = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
		} else if (status.running) {
			label = 'Running (detached)';
			icon = new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('charts.yellow'));
		} else {
			label = 'Stopped';
			icon = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
		}

		const statusItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
		statusItem.iconPath = icon;
		statusItem.description = status.pid ? `PID ${status.pid}` : undefined;
		if (status.running) {
			statusItem.command = {
				command: 'citadel.showMayorTerminal',
				title: 'Show Mayor Terminal',
			};
			statusItem.tooltip = status.attached
				? 'Click to show mayor terminal'
				: 'Click to attach and show mayor terminal';
		}

		const items: vscode.TreeItem[] = [statusItem];

		if (status.uptime) {
			const uptimeItem = new vscode.TreeItem(
				`Uptime: ${status.uptime}`,
				vscode.TreeItemCollapsibleState.None,
			);
			uptimeItem.iconPath = new vscode.ThemeIcon('clock');
			items.push(uptimeItem);
		}

		return items;
	}
}
