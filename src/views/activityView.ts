/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import type { ActivityEvent, ActivityCategory } from '../cli/contracts';

const CATEGORY_ORDER: ActivityCategory[] = ['agent', 'work', 'comms', 'system'];

export class ActivityTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _filterCategory: ActivityCategory | null = null;

	constructor(private readonly client: GtClient) {}

	get filterCategory(): ActivityCategory | null {
		return this._filterCategory;
	}

	cycleFilter(): void {
		if (this._filterCategory === null) {
			this._filterCategory = CATEGORY_ORDER[0];
		} else {
			const idx = CATEGORY_ORDER.indexOf(this._filterCategory);
			if (idx >= CATEGORY_ORDER.length - 1) {
				this._filterCategory = null;
			} else {
				this._filterCategory = CATEGORY_ORDER[idx + 1];
			}
		}
		this._onDidChangeTreeData.fire();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<vscode.TreeItem[]> {
		const events = this.client.getActivityEvents(200);

		if (events.length === 0) {
			const item = new vscode.TreeItem('No activity events');
			item.iconPath = new vscode.ThemeIcon('history');
			return [item];
		}

		const filtered = this._filterCategory
			? events.filter(e => e.category === this._filterCategory)
			: events;

		if (filtered.length === 0) {
			const item = new vscode.TreeItem(`No ${this._filterCategory} events`);
			item.iconPath = new vscode.ThemeIcon('filter');
			return [item];
		}

		return filtered.slice(0, 50).map(e => new ActivityTreeItem(e));
	}
}

class ActivityTreeItem extends vscode.TreeItem {
	constructor(public readonly event: ActivityEvent) {
		super(ActivityTreeItem.buildLabel(event), vscode.TreeItemCollapsibleState.None);
		this.description = ActivityTreeItem.buildDescription(event);
		this.tooltip = ActivityTreeItem.buildTooltip(event);
		this.iconPath = ActivityTreeItem.getIcon(event);
		this.contextValue = 'activityItem';
	}

	private static buildLabel(event: ActivityEvent): string {
		switch (event.type) {
			case 'spawn':
				return `Spawned ${(event.payload as Record<string, unknown>).polecat ?? 'agent'}`;
			case 'session_death':
				return `Session ended: ${event.actor}`;
			case 'sling':
				return `Slung ${(event.payload as Record<string, unknown>).bead ?? 'bead'}`;
			case 'hook':
				return `Hooked ${(event.payload as Record<string, unknown>).bead ?? 'bead'}`;
			case 'mail':
				return `${(event.payload as Record<string, unknown>).subject ?? 'Mail'}`;
			case 'handoff':
				return `Handoff: ${(event.payload as Record<string, unknown>).subject ?? event.actor}`;
			case 'completion':
				return `Completed: ${event.actor}`;
			default:
				return `${event.type}: ${event.actor}`;
		}
	}

	private static buildDescription(event: ActivityEvent): string {
		return ActivityTreeItem.formatRelativeTime(event.ts);
	}

	private static buildTooltip(event: ActivityEvent): vscode.MarkdownString {
		const md = new vscode.MarkdownString('', true);
		md.isTrusted = true;
		md.appendMarkdown(`**${event.type}**\n\n`);
		md.appendMarkdown(`| | |\n|---|---|\n`);
		md.appendMarkdown(`| **Time** | ${event.ts} |\n`);
		md.appendMarkdown(`| **Actor** | ${event.actor} |\n`);
		md.appendMarkdown(`| **Category** | ${event.category} |\n`);
		md.appendMarkdown(`| **Source** | ${event.source} |\n`);

		for (const [key, value] of Object.entries(event.payload)) {
			md.appendMarkdown(`| **${key}** | ${String(value)} |\n`);
		}
		return md;
	}

	private static getIcon(event: ActivityEvent): vscode.ThemeIcon {
		switch (event.type) {
			case 'spawn':
				return new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('testing.iconPassed'));
			case 'session_death':
				return new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('testing.iconFailed'));
			case 'sling':
				return new vscode.ThemeIcon('rocket', new vscode.ThemeColor('editorInfo.foreground'));
			case 'hook':
				return new vscode.ThemeIcon('pin', new vscode.ThemeColor('editorInfo.foreground'));
			case 'mail':
				return new vscode.ThemeIcon('mail', new vscode.ThemeColor('editorWarning.foreground'));
			case 'handoff':
				return new vscode.ThemeIcon('arrow-swap', new vscode.ThemeColor('terminal.ansiCyan'));
			case 'completion':
				return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
			default:
				return new vscode.ThemeIcon('circle-outline');
		}
	}

	private static formatRelativeTime(isoString: string): string {
		try {
			const then = new Date(isoString).getTime();
			const now = Date.now();
			const diffSec = Math.floor((now - then) / 1000);

			if (diffSec < 60) { return 'just now'; }
			if (diffSec < 3600) { return `${Math.floor(diffSec / 60)}m ago`; }
			if (diffSec < 86400) { return `${Math.floor(diffSec / 3600)}h ago`; }
			return `${Math.floor(diffSec / 86400)}d ago`;
		} catch {
			return isoString;
		}
	}
}
