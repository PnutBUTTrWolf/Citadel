/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import type { GtMergeQueueItem } from '../cli/contracts';

export class QueueTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
		if (element instanceof RigGroupItem) {
			return element.items.map(i => new QueueTreeItem(i));
		}

		const items = await this.client.getMergeQueue();
		if (items.length === 0) {
			const item = new vscode.TreeItem('Merge queue is empty');
			item.iconPath = new vscode.ThemeIcon('check');
			return [item];
		}

		const byRig = new Map<string, GtMergeQueueItem[]>();
		for (const i of items) {
			const rig = i.rig || '(unknown)';
			if (!byRig.has(rig)) { byRig.set(rig, []); }
			byRig.get(rig)!.push(i);
		}

		if (byRig.size === 1) {
			return items.map(i => new QueueTreeItem(i));
		}

		return Array.from(byRig.entries()).map(
			([rig, rigItems]) => new RigGroupItem(rig, rigItems),
		);
	}
}

class RigGroupItem extends vscode.TreeItem {
	constructor(
		public readonly rigName: string,
		public readonly items: GtMergeQueueItem[],
	) {
		super(rigName, vscode.TreeItemCollapsibleState.Expanded);
		this.contextValue = 'queueRig';
		this.description = `${items.length} item(s)`;
		this.iconPath = new vscode.ThemeIcon('repo');
	}
}

export class QueueTreeItem extends vscode.TreeItem {
	constructor(public readonly item: GtMergeQueueItem) {
		super(item.title || item.branch, vscode.TreeItemCollapsibleState.None);

		this.contextValue = item.status === 'failed' || item.status === 'blocked'
			? 'queueItemRetryable'
			: 'queueItem';
		this.description = `#${item.position} ${item.status}`;
		this.tooltip = QueueTreeItem.buildTooltip(item);
		this.iconPath = QueueTreeItem.getIcon(item.status);

		if (item.pr_url) {
			this.command = {
				command: 'vscode.open',
				title: 'Open PR',
				arguments: [vscode.Uri.parse(item.pr_url)],
			};
		}
	}

	private static buildTooltip(item: GtMergeQueueItem): string {
		const lines = [
			`Branch: ${item.branch}`,
			`Status: ${item.status}`,
			`Position: ${item.position}`,
		];
		if (item.agent) { lines.push(`Agent: ${item.agent}`); }
		if (item.bead_id) { lines.push(`Bead: ${item.bead_id}`); }
		if (item.pr_url) { lines.push(`PR: ${item.pr_url}`); }
		return lines.join('\n');
	}

	private static getIcon(status: string): vscode.ThemeIcon {
		switch (status) {
			case 'merging':
				return new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('testing.runAction'));
			case 'merged':
				return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
			case 'blocked':
				return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
			case 'failed':
				return new vscode.ThemeIcon('close', new vscode.ThemeColor('testing.iconFailed'));
			default:
				return new vscode.ThemeIcon('clock');
		}
	}
}
