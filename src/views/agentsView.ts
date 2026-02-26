/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, GtAgent } from '../gtClient';
import type { AgentDisplayStatus } from '../constants';

export type AgentsTreeElement = GroupTreeItem | AgentTreeItem;

export class AgentsTreeProvider implements vscode.TreeDataProvider<AgentsTreeElement> {
	private _onDidChangeTreeData = new vscode.EventEmitter<AgentsTreeElement | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private _runningCount = 0;
	private _onRunningCountChanged?: (count: number) => void;

	constructor(private readonly client: GtClient) {}

	set onRunningCountChanged(cb: ((count: number) => void) | undefined) {
		this._onRunningCountChanged = cb;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: AgentsTreeElement): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: AgentsTreeElement): Promise<AgentsTreeElement[]> {
		if (!element) {
			return this.getRootGroups();
		}

		if (element instanceof GroupTreeItem) {
			return this.getGroupChildren(element);
		}

		if (element instanceof AgentTreeItem && !element.isDetail) {
			return this.getAgentDetails(element.agent);
		}

		return [];
	}

	private async getRootGroups(): Promise<GroupTreeItem[]> {
		const allAgents = await this.client.getAgents();
		const runningCount = allAgents.filter(a => a.running).length;
		if (runningCount !== this._runningCount) {
			this._runningCount = runningCount;
			this._onRunningCountChanged?.(runningCount);
		}
		const workers = allAgents.filter(a => !GtClient.isInfrastructureRole(a.role));
		const infra = allAgents.filter(a => GtClient.isInfrastructureRole(a.role));

		const groups: GroupTreeItem[] = [];

		groups.push(new GroupTreeItem(
			'workers',
			workers,
			workers.length > 0
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.None,
		));

		if (infra.length > 0) {
			groups.push(new GroupTreeItem(
				'infrastructure',
				infra,
				vscode.TreeItemCollapsibleState.Collapsed,
			));
		}

		return groups;
	}

	private getGroupChildren(group: GroupTreeItem): AgentsTreeElement[] {
		if (group.agents.length === 0) {
			return [new AgentTreeItem(
				{ name: '(none running)', status: '', displayStatus: 'exited', rig: '', role: '', running: false, hasWork: false },
				vscode.TreeItemCollapsibleState.None,
				true,
			)];
		}

		return group.agents.map(a =>
			new AgentTreeItem(a, vscode.TreeItemCollapsibleState.Collapsed)
		);
	}

	private getAgentDetails(agent: GtAgent): AgentTreeItem[] {
		const items: AgentTreeItem[] = [];

		if (agent.currentTask) {
			items.push(AgentTreeItem.detail(agent, `Task: ${agent.currentTask}`, 'note'));
		}
		if (agent.rig) {
			items.push(AgentTreeItem.detail(agent, `Rig: ${agent.rig}`, 'repo'));
		}
		items.push(AgentTreeItem.detail(agent, `Role: ${agent.role}`, 'symbol-class'));
		if (agent.polecatState) {
			items.push(AgentTreeItem.detail(agent, `State: ${agent.polecatState}`, 'symbol-enum'));
		}
		if (agent.beadId) {
			const beadItem = AgentTreeItem.detail(agent, `Bead: ${agent.beadId}`, 'circle-outline');
			beadItem.command = {
				command: 'citadel.showBead',
				title: 'Show Bead Details',
				arguments: [{ bead: { id: agent.beadId } }],
			};
			items.push(beadItem);
		}
		if (agent.address) {
			items.push(AgentTreeItem.detail(agent, `Address: ${agent.address}`, 'symbol-reference'));
		}
		if (agent.session) {
			items.push(AgentTreeItem.detail(agent, `Session: ${agent.session}`, 'terminal-tmux'));
		}
		if (agent.unreadMail !== undefined && agent.unreadMail > 0) {
			items.push(AgentTreeItem.detail(agent, `Mail: ${agent.unreadMail} unread`, 'mail'));
		}
		if (agent.pid) {
			items.push(AgentTreeItem.detail(agent, `PID: ${agent.pid}`, 'symbol-number'));
		}

		return items;
	}
}

export class GroupTreeItem extends vscode.TreeItem {
	constructor(
		public readonly groupKind: 'workers' | 'infrastructure',
		public readonly agents: GtAgent[],
		collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		const label = groupKind === 'workers' ? 'Workers' : 'Infrastructure';
		super(label, collapsibleState);

		this.contextValue = 'agentGroup';

		const running = agents.filter(a => a.running).length;
		this.description = running > 0 ? `${running}/${agents.length} running` : `${agents.length}`;

		if (groupKind === 'workers') {
			this.iconPath = new vscode.ThemeIcon('server-process');
		} else {
			this.iconPath = new vscode.ThemeIcon('tools');
		}
	}
}

export class AgentTreeItem extends vscode.TreeItem {
	constructor(
		public readonly agent: GtAgent,
		public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly isDetail = false,
	) {
		super(agent.name, collapsibleState);

		if (!isDetail) {
			this.contextValue = 'agent';
			this.description = AgentTreeItem.buildDescription(agent);
			this.iconPath = AgentTreeItem.getIcon(agent);
			this.tooltip = AgentTreeItem.buildTooltip(agent);
			this.command = {
				command: 'citadel.openAgentTerminal',
				title: 'Open Agent Terminal',
				arguments: [{ agent }],
			};
		} else {
			this.contextValue = 'agentDetail';
		}
	}

	static detail(agent: GtAgent, label: string, icon: string): AgentTreeItem {
		const item = new AgentTreeItem(
			{ ...agent, name: label },
			vscode.TreeItemCollapsibleState.None,
			true,
		);
		item.iconPath = new vscode.ThemeIcon(icon);
		return item;
	}

	private static buildDescription(agent: GtAgent): string {
		const parts: string[] = [];

		if (agent.polecatState) {
			parts.push(agent.polecatState);
		} else {
			parts.push(agent.displayStatus);
		}

		if (agent.beadId) {
			parts.push(`· ${agent.beadId}`);
		} else if (agent.hasWork) {
			parts.push('· has work');
		}

		return parts.join(' ');
	}

	private static buildTooltip(agent: GtAgent): vscode.MarkdownString {
		const md = new vscode.MarkdownString('', true);
		md.isTrusted = true;
		md.appendMarkdown(`**${agent.name}** (${agent.role})\n\n`);
		md.appendMarkdown(`| | |\n|---|---|\n`);
		md.appendMarkdown(`| **Status** | ${agent.displayStatus} |\n`);
		if (agent.polecatState) {
			md.appendMarkdown(`| **Polecat State** | ${agent.polecatState} |\n`);
		}
		if (agent.rig) {
			md.appendMarkdown(`| **Rig** | ${agent.rig} |\n`);
		}
		if (agent.currentTask) {
			md.appendMarkdown(`| **Task** | ${agent.currentTask} |\n`);
		}
		if (agent.beadId) {
			md.appendMarkdown(`| **Bead** | \`${agent.beadId}\` |\n`);
		}
		if (agent.address) {
			md.appendMarkdown(`| **Address** | \`${agent.address}\` |\n`);
		}
		if (agent.unreadMail !== undefined && agent.unreadMail > 0) {
			md.appendMarkdown(`| **Unread Mail** | ${agent.unreadMail} |\n`);
		}
		md.appendMarkdown('\n---\n*Click to open terminal*');
		return md;
	}

	private static getIcon(agent: GtAgent): vscode.ThemeIcon {
		if (agent.polecatState) {
			return AgentTreeItem.getPolecatIcon(agent.polecatState);
		}
		return AgentTreeItem.getDisplayStatusIcon(agent.displayStatus);
	}

	private static getPolecatIcon(state: string): vscode.ThemeIcon {
		switch (state) {
			case 'working':
				return new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('testing.runAction'));
			case 'done':
				return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
			case 'stuck':
				return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
			default:
				return new vscode.ThemeIcon('circle-outline');
		}
	}

	private static getDisplayStatusIcon(status: AgentDisplayStatus): vscode.ThemeIcon {
		switch (status) {
			case 'running':
				return new vscode.ThemeIcon('pulse', new vscode.ThemeColor('testing.runAction'));
			case 'idle':
				return new vscode.ThemeIcon('circle-outline');
			case 'completing':
				return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
			case 'stuck':
				return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
			case 'dead':
				return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
			case 'exited':
				return new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('disabledForeground'));
		}
	}
}
