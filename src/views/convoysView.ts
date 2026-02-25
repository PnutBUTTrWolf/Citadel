/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, GtConvoy, GtBead } from '../gtClient';

export class ConvoysTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
		if (element instanceof ConvoyTreeItem) {
			return element.convoy.tracked.map(b => new BeadTreeItem(b));
		}

		const convoys = await this.client.getConvoys();
		if (convoys.length === 0) {
			const item = new vscode.TreeItem('No active convoys');
			item.iconPath = new vscode.ThemeIcon('info');
			return [item];
		}

		return convoys.map(c => new ConvoyTreeItem(c));
	}
}

export class ConvoyTreeItem extends vscode.TreeItem {
	constructor(public readonly convoy: GtConvoy) {
		const hasBeads = convoy.tracked.length > 0;
		super(
			convoy.title || convoy.id,
			hasBeads
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.None
		);

		this.contextValue = 'convoy';
		this.description = `${convoy.progress.completed}/${convoy.progress.total}`;
		this.tooltip = `Convoy: ${convoy.title}\nID: ${convoy.id}\nStatus: ${convoy.status}\nProgress: ${convoy.progress.completed}/${convoy.progress.total}`;
		this.iconPath = ConvoyTreeItem.getIcon(convoy);
	}

	private static getIcon(convoy: GtConvoy): vscode.ThemeIcon {
		if (convoy.progress.completed === convoy.progress.total && convoy.progress.total > 0) {
			return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
		}
		if (convoy.progress.completed > 0) {
			return new vscode.ThemeIcon('loading~spin');
		}
		return new vscode.ThemeIcon('tasklist');
	}
}

export class BeadTreeItem extends vscode.TreeItem {
	constructor(public readonly bead: GtBead) {
		super(bead.title || bead.id, vscode.TreeItemCollapsibleState.None);

		this.contextValue = 'bead';
		this.description = bead.assignee ? `→ ${bead.assignee}` : bead.status;
		this.tooltip = `Bead: ${bead.id}\nTitle: ${bead.title}\nStatus: ${bead.status}\nAssignee: ${bead.assignee || 'unassigned'}`;
		this.iconPath = BeadTreeItem.getIcon(bead.status);

		if (bead.assignee) {
			this.command = {
				command: 'citadel.openAgentTerminal',
				title: 'Open Agent Terminal',
				arguments: [{ agent: { name: bead.assignee, status: bead.status, rig: '', role: 'polecat' } }],
			};
		}
	}

	private static getIcon(status: string): vscode.ThemeIcon {
		switch (status.toLowerCase()) {
			case 'completed':
			case 'done':
				return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
			case 'in_progress':
			case 'active':
			case 'working':
				return new vscode.ThemeIcon('loading~spin');
			case 'assigned':
				return new vscode.ThemeIcon('arrow-right');
			default:
				return new vscode.ThemeIcon('circle-outline');
		}
	}
}
