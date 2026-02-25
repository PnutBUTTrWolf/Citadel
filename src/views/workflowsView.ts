/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import type { GtFormula, GtMolecule, WorkflowStatus } from '../cli/contracts';

export class WorkflowsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
		if (element instanceof FormulaTreeItem) {
			return element.molecules.map(m => new MoleculeTreeItem(m));
		}

		const [formulas, molecules] = await Promise.all([
			this.client.getFormulas(),
			this.client.getWorkflows(),
		]);

		if (formulas.length === 0 && molecules.length === 0) {
			const item = new vscode.TreeItem('No workflows');
			item.iconPath = new vscode.ThemeIcon('beaker');
			return [item];
		}

		const moleculesByFormula = new Map<string, GtMolecule[]>();
		for (const m of molecules) {
			const key = m.formula_id;
			if (!moleculesByFormula.has(key)) { moleculesByFormula.set(key, []); }
			moleculesByFormula.get(key)!.push(m);
		}

		const items: vscode.TreeItem[] = [];
		for (const f of formulas) {
			const mols = moleculesByFormula.get(f.id) || [];
			items.push(new FormulaTreeItem(f, mols));
			moleculesByFormula.delete(f.id);
		}

		// Orphan molecules (formula not in list)
		for (const [, mols] of moleculesByFormula) {
			for (const m of mols) {
				items.push(new MoleculeTreeItem(m));
			}
		}

		return items;
	}
}

class FormulaTreeItem extends vscode.TreeItem {
	constructor(
		public readonly formula: GtFormula,
		public readonly molecules: GtMolecule[],
	) {
		super(
			formula.name,
			molecules.length > 0
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.Collapsed,
		);

		this.contextValue = 'formula';
		this.description = `${formula.steps} steps`;
		this.tooltip = formula.description || formula.name;
		this.iconPath = new vscode.ThemeIcon('beaker');
	}
}

export class MoleculeTreeItem extends vscode.TreeItem {
	constructor(public readonly molecule: GtMolecule) {
		super(molecule.formula_name || molecule.id, vscode.TreeItemCollapsibleState.None);

		this.contextValue = 'molecule';
		this.description = `${molecule.progress.completed}/${molecule.progress.total} ${molecule.status}`;
		this.tooltip = MoleculeTreeItem.buildTooltip(molecule);
		this.iconPath = MoleculeTreeItem.getIcon(molecule.status);
	}

	private static buildTooltip(m: GtMolecule): string {
		const lines = [
			`Molecule: ${m.id}`,
			`Status: ${m.status}`,
			`Progress: ${m.progress.completed}/${m.progress.total}`,
		];
		if (m.rig) { lines.push(`Rig: ${m.rig}`); }
		return lines.join('\n');
	}

	private static getIcon(status: WorkflowStatus): vscode.ThemeIcon {
		switch (status) {
			case 'running':
				return new vscode.ThemeIcon('loading~spin');
			case 'completed':
				return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
			case 'failed':
				return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
			case 'paused':
				return new vscode.ThemeIcon('debug-pause');
			default:
				return new vscode.ThemeIcon('circle-outline');
		}
	}
}
