/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import type { GtActivityEvent, ActivityEventKind } from '../cli/contracts';

export class ActivityTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly client: GtClient) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<vscode.TreeItem[]> {
		const events = await this.client.getActivityFeed();
		if (events.length === 0) {
			const item = new vscode.TreeItem('No recent activity');
			item.iconPath = new vscode.ThemeIcon('history');
			return [item];
		}
		return events.map(e => new ActivityTreeItem(e));
	}
}

class ActivityTreeItem extends vscode.TreeItem {
	constructor(event: GtActivityEvent) {
		super(event.summary, vscode.TreeItemCollapsibleState.None);

		this.description = relativeTime(event.timestamp);
		this.tooltip = ActivityTreeItem.buildTooltip(event);
		this.iconPath = ActivityTreeItem.getIcon(event.kind);
		this.contextValue = 'activityEvent';
	}

	private static buildTooltip(e: GtActivityEvent): string {
		const lines = [e.summary, `Time: ${e.timestamp}`];
		if (e.agent) { lines.push(`Agent: ${e.agent}`); }
		if (e.rig) { lines.push(`Rig: ${e.rig}`); }
		if (e.bead_id) { lines.push(`Bead: ${e.bead_id}`); }
		return lines.join('\n');
	}

	private static getIcon(kind: ActivityEventKind): vscode.ThemeIcon {
		if (kind.startsWith('agent_'))   { return new vscode.ThemeIcon('person'); }
		if (kind.startsWith('bead_'))    { return new vscode.ThemeIcon('circle-outline'); }
		if (kind.startsWith('convoy_'))  { return new vscode.ThemeIcon('tasklist'); }
		if (kind.startsWith('mail_'))    { return new vscode.ThemeIcon('mail'); }
		if (kind.startsWith('escalation_')) { return new vscode.ThemeIcon('warning'); }
		if (kind.startsWith('workflow_')) { return new vscode.ThemeIcon('beaker'); }
		if (kind.startsWith('merge_'))   { return new vscode.ThemeIcon('git-merge'); }
		if (kind.startsWith('daemon_'))  { return new vscode.ThemeIcon('pulse'); }
		return new vscode.ThemeIcon('history');
	}
}

function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const sec = Math.floor(diff / 1000);
	if (sec < 60)   { return `${sec}s ago`; }
	const min = Math.floor(sec / 60);
	if (min < 60)   { return `${min}m ago`; }
	const hrs = Math.floor(min / 60);
	if (hrs < 24)   { return `${hrs}h ago`; }
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}
