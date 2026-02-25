/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, GtBead } from '../gtClient';

export type BeadFilterMode = 'active' | 'all';

const SYSTEM_ISSUE_TYPES = new Set(['agent', 'molecule', 'gate', 'rig', 'wisp', 'convoy', 'event']);
const COMPLETED_STATUSES = new Set(['completed', 'done', 'closed']);

const SYSTEM_TAGS = new Set(['gt:rig', 'gt:agent']);

function isSystemBead(bead: GtBead): boolean {
	if (bead.issue_type && SYSTEM_ISSUE_TYPES.has(bead.issue_type)) {
		return true;
	}
	if (bead.tags?.some(t => SYSTEM_TAGS.has(t))) {
		return true;
	}
	return /\bwisp-/.test(bead.id) || /\bmol-/.test(bead.id);
}

function isHqBead(bead: GtBead): boolean {
	return bead.id.startsWith('hq-');
}

function isCompletedBead(bead: GtBead): boolean {
	return COMPLETED_STATUSES.has(bead.status.toLowerCase());
}


export class BeadsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _filterMode: BeadFilterMode = 'active';

	constructor(private readonly client: GtClient) {}

	get filterMode(): BeadFilterMode {
		return this._filterMode;
	}

	setFilterMode(mode: BeadFilterMode): void {
		this._filterMode = mode;
		vscode.commands.executeCommand('setContext', 'citadel.beadsFilterMode', mode);
		this.refresh();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		// Section children: return the beads in this section
		if (element instanceof BeadSectionItem) {
			return element.beads.map(b => this.createBeadItem(b));
		}

		// Epic children: fetch child beads
		if (element instanceof BeadViewItem && element.bead.issue_type === 'epic') {
			try {
				const children = await this.client.listBeads({ parent: element.bead.id });
				return children.map(b => new BeadViewItem(b, vscode.TreeItemCollapsibleState.None));
			} catch {
				return [];
			}
		}

		// Root level: fetch all beads and group into sections
		const beads = await this.client.listBeads({ all: true });

		if (beads.length === 0) {
			const item = new vscode.TreeItem('No beads — click + to create one');
			item.iconPath = new vscode.ThemeIcon('info');
			return [item];
		}

		const epics: GtBead[] = [];
		const activeWork: GtBead[] = [];
		const system: GtBead[] = [];

		for (const bead of beads) {
			if (isHqBead(bead)) {
				continue;
			}
			if (this._filterMode === 'active' && isCompletedBead(bead)) {
				continue;
			}
			if (isSystemBead(bead)) {
				system.push(bead);
			} else if (bead.issue_type === 'epic') {
				epics.push(bead);
			} else {
				activeWork.push(bead);
			}
		}

		const sections: BeadSectionItem[] = [];

		if (epics.length > 0) {
			sections.push(new BeadSectionItem(
				'Epics', epics,
				vscode.TreeItemCollapsibleState.Collapsed,
				'telescope',
			));
		}

		sections.push(new BeadSectionItem(
			'Active Work', activeWork,
			vscode.TreeItemCollapsibleState.Expanded,
			'tasklist',
		));

		if (system.length > 0) {
			sections.push(new BeadSectionItem(
				'System', system,
				vscode.TreeItemCollapsibleState.Collapsed,
				'gear',
			));
		}

		return sections;
	}

	private createBeadItem(bead: GtBead): BeadViewItem {
		const isEpic = bead.issue_type === 'epic';
		const state = isEpic
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;
		return new BeadViewItem(bead, state);
	}
}

export class BeadSectionItem extends vscode.TreeItem {
	constructor(
		public readonly sectionLabel: string,
		public readonly beads: GtBead[],
		collapsibleState: vscode.TreeItemCollapsibleState,
		icon: string,
	) {
		super(`${sectionLabel} (${beads.length})`, collapsibleState);
		this.iconPath = new vscode.ThemeIcon(icon);
		this.contextValue = 'beadSection';
	}
}

export class BeadViewItem extends vscode.TreeItem {
	constructor(
		public readonly bead: GtBead,
		collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
	) {
		super(bead.title || bead.id, collapsibleState);

		const isAssigned = bead.assignee && bead.status !== 'pending';
		this.contextValue = isAssigned ? 'beadItemAssigned' : 'beadItem';
		this.description = BeadViewItem.buildDescription(bead);
		this.tooltip = BeadViewItem.buildTooltip(bead);
		this.iconPath = BeadViewItem.getIcon(bead.status);

		if (isAssigned) {
			this.command = {
				command: 'citadel.openBeadTerminal',
				title: 'Open Agent Terminal',
				arguments: [bead],
			};
		} else {
			this.command = {
				command: 'citadel.showBead',
				title: 'Show Bead Details',
				arguments: [{ bead }],
			};
		}
	}

	private static buildDescription(bead: GtBead): string {
		const parts: string[] = [];
		if (bead.id) {
			parts.push(bead.id);
		}
		if (bead.assignee) {
			parts.push(`→ ${bead.assignee}`);
		} else {
			parts.push(bead.status);
		}
		return parts.join('  ');
	}

	private static buildTooltip(bead: GtBead): vscode.MarkdownString {
		const md = new vscode.MarkdownString('', true);
		md.isTrusted = true;
		md.appendMarkdown(`**${bead.title || bead.id}**\n\n`);
		md.appendMarkdown(`| | |\n|---|---|\n`);
		md.appendMarkdown(`| **ID** | \`${bead.id}\` |\n`);
		md.appendMarkdown(`| **Status** | ${BeadViewItem.statusLabel(bead.status)} |\n`);
		if (bead.assignee) {
			md.appendMarkdown(`| **Assignee** | ${bead.assignee} |\n`);
		}
		md.appendMarkdown('\n---\n');
		if (bead.assignee) {
			md.appendMarkdown('*Click to open agent terminal*');
		} else {
			md.appendMarkdown('*Click to view details*');
		}
		return md;
	}

	private static statusLabel(status: string): string {
		switch (status.toLowerCase()) {
			case 'completed':
			case 'done':
				return '$(check) Completed';
			case 'in_progress':
			case 'active':
			case 'working':
				return '$(sync~spin) In Progress';
			case 'assigned':
				return '$(arrow-right) Assigned';
			default:
				return '$(circle-outline) Pending';
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
