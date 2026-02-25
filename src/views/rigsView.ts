/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, GtRig, GtHook } from '../gtClient';

export class RigsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
		if (element instanceof RigTreeItem) {
			return this.getRigChildren(element.rig);
		}

		const rigs = await this.client.getRigs();
		if (rigs.length === 0) {
			const item = new vscode.TreeItem('No rigs configured');
			item.iconPath = new vscode.ThemeIcon('info');
			return [item];
		}

		return rigs.map(r => new RigTreeItem(r));
	}

	private getRigChildren(rig: GtRig): vscode.TreeItem[] {
		const items: vscode.TreeItem[] = [];

		for (const hook of rig.hooks) {
			items.push(new HookTreeItem(hook));
		}

		for (const crew of rig.crewMembers) {
			items.push(new CrewTreeItem(crew, rig.name));
		}

		if (items.length === 0) {
			const empty = new vscode.TreeItem('No hooks or crew');
			empty.iconPath = new vscode.ThemeIcon('dash');
			items.push(empty);
		}

		return items;
	}
}

export class RigTreeItem extends vscode.TreeItem {
	constructor(public readonly rig: GtRig) {
		super(rig.name, vscode.TreeItemCollapsibleState.Collapsed);
		this.contextValue = 'rig';
		this.description = rig.repoUrl;
		this.iconPath = new vscode.ThemeIcon('repo');
		this.tooltip = `Rig: ${rig.name}\nRepo: ${rig.repoUrl}\nHooks: ${rig.hooks.length}\nCrew: ${rig.crewMembers.length}`;
	}
}

export class HookTreeItem extends vscode.TreeItem {
	constructor(public readonly hook: GtHook) {
		super(hook.name, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'hook';
		this.description = hook.status;
		this.tooltip = `Hook: ${hook.name}\nStatus: ${hook.status}\nAgent: ${hook.agent || 'none'}\nBranch: ${hook.branch || 'none'}`;
		this.iconPath = HookTreeItem.getIcon(hook.status);

		if (hook.agent) {
			this.command = {
				command: 'citadel.openAgentTerminal',
				title: 'Open Agent Terminal',
				arguments: [{ agent: { name: hook.agent, status: hook.status, rig: '', role: 'polecat' } }],
			};
		}
	}

	private static getIcon(status: string): vscode.ThemeIcon {
		switch (status.toLowerCase()) {
			case 'active':
				return new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('testing.runAction'));
			case 'idle':
				return new vscode.ThemeIcon('circle-outline');
			case 'completed':
				return new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('testing.iconPassed'));
			case 'suspended':
				return new vscode.ThemeIcon('debug-pause');
			default:
				return new vscode.ThemeIcon('git-branch');
		}
	}
}

export class CrewTreeItem extends vscode.TreeItem {
	constructor(name: string, rigName: string) {
		super(name, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'crew';
		this.description = 'crew member';
		this.iconPath = new vscode.ThemeIcon('person');
		this.tooltip = `Crew: ${name}\nRig: ${rigName}`;
	}
}
