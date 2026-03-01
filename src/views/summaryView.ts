/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, type DashboardSummary } from '../gtClient';

export type SummaryTreeElement = SummaryGroupItem | SummaryStatItem;

export class SummaryTreeProvider implements vscode.TreeDataProvider<SummaryTreeElement> {
	private _onDidChangeTreeData = new vscode.EventEmitter<SummaryTreeElement | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _summary: DashboardSummary | undefined;
	private _onHasAlertsChanged?: (hasAlerts: boolean) => void;
	private _lastHasAlerts = false;

	constructor(private readonly client: GtClient) {}

	set onHasAlertsChanged(cb: ((hasAlerts: boolean) => void) | undefined) {
		this._onHasAlertsChanged = cb;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: SummaryTreeElement): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: SummaryTreeElement): Promise<SummaryTreeElement[]> {
		if (element) {
			if (element instanceof SummaryGroupItem) {
				return element.children;
			}
			return [];
		}

		try {
			this._summary = await this.client.getSummary();
		} catch {
			this._summary = undefined;
		}

		if (!this._summary) {
			return [new SummaryStatItem('Unable to load summary', '', 'warning')];
		}

		const s = this._summary;

		// Notify about alert state changes
		if (s.hasAlerts !== this._lastHasAlerts) {
			this._lastHasAlerts = s.hasAlerts;
			this._onHasAlertsChanged?.(s.hasAlerts);
		}

		const items: SummaryTreeElement[] = [];

		// Stats row
		const statsChildren: SummaryStatItem[] = [
			new SummaryStatItem('Polecats', String(s.polecatCount), 'server-process'),
			new SummaryStatItem('Hooks', String(s.hookCount), 'git-commit'),
			new SummaryStatItem('Issues', String(s.issueCount), 'circle-outline'),
			new SummaryStatItem('Convoys', String(s.convoyCount), 'tasklist'),
			new SummaryStatItem('Escalations', String(s.escalationCount), 'megaphone'),
		];
		items.push(new SummaryGroupItem(
			'Stats',
			this.buildStatsDescription(s),
			'dashboard',
			statsChildren,
			vscode.TreeItemCollapsibleState.Collapsed,
		));

		// Alerts row (only if there are alerts)
		if (s.hasAlerts) {
			const alertChildren: SummaryStatItem[] = [];
			if (s.stuckPolecats > 0) {
				alertChildren.push(new SummaryStatItem(
					'Stuck Polecats', String(s.stuckPolecats), 'warning',
					new vscode.ThemeColor('editorWarning.foreground'),
				));
			}
			if (s.staleHooks > 0) {
				alertChildren.push(new SummaryStatItem(
					'Stale Hooks', String(s.staleHooks), 'clock',
					new vscode.ThemeColor('editorWarning.foreground'),
				));
			}
			if (s.unackedEscalations > 0) {
				alertChildren.push(new SummaryStatItem(
					'Escalations', String(s.unackedEscalations), 'megaphone',
					new vscode.ThemeColor('editorError.foreground'),
				));
			}
			if (s.deadSessions > 0) {
				alertChildren.push(new SummaryStatItem(
					'Dead Sessions', String(s.deadSessions), 'error',
					new vscode.ThemeColor('testing.iconFailed'),
				));
			}
			if (s.highPriorityIssues > 0) {
				alertChildren.push(new SummaryStatItem(
					'P1/P2 Issues', String(s.highPriorityIssues), 'flame',
					new vscode.ThemeColor('editorError.foreground'),
				));
			}

			items.push(new SummaryGroupItem(
				'Alerts',
				this.buildAlertsDescription(s),
				'bell-dot',
				alertChildren,
				vscode.TreeItemCollapsibleState.Expanded,
				new vscode.ThemeColor('editorWarning.foreground'),
			));
		} else {
			items.push(new SummaryGroupItem(
				'Alerts',
				'None',
				'bell',
				[],
				vscode.TreeItemCollapsibleState.None,
			));
		}

		return items;
	}

	private buildStatsDescription(s: DashboardSummary): string {
		const parts: string[] = [];
		parts.push(`${s.polecatCount}P`);
		parts.push(`${s.hookCount}H`);
		parts.push(`${s.issueCount}I`);
		if (s.convoyCount > 0) { parts.push(`${s.convoyCount}C`); }
		if (s.escalationCount > 0) { parts.push(`${s.escalationCount}E`); }
		return parts.join(' · ');
	}

	private buildAlertsDescription(s: DashboardSummary): string {
		const parts: string[] = [];
		if (s.stuckPolecats > 0) { parts.push(`${s.stuckPolecats} stuck`); }
		if (s.staleHooks > 0) { parts.push(`${s.staleHooks} stale`); }
		if (s.unackedEscalations > 0) { parts.push(`${s.unackedEscalations} esc`); }
		if (s.deadSessions > 0) { parts.push(`${s.deadSessions} dead`); }
		if (s.highPriorityIssues > 0) { parts.push(`${s.highPriorityIssues} P1/P2`); }
		return parts.join(' · ');
	}
}

export class SummaryGroupItem extends vscode.TreeItem {
	constructor(
		label: string,
		description: string,
		icon: string,
		public readonly children: SummaryStatItem[],
		collapsibleState: vscode.TreeItemCollapsibleState,
		iconColor?: vscode.ThemeColor,
	) {
		super(label, collapsibleState);
		this.description = description;
		this.iconPath = new vscode.ThemeIcon(icon, iconColor);
		this.contextValue = 'summaryGroup';
	}
}

export class SummaryStatItem extends vscode.TreeItem {
	constructor(
		label: string,
		value: string,
		icon: string,
		iconColor?: vscode.ThemeColor,
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.description = value;
		this.iconPath = new vscode.ThemeIcon(icon, iconColor);
		this.contextValue = 'summaryStat';
	}
}
