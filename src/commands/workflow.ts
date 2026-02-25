/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';

export async function cookWorkflow(client: GtClient): Promise<void> {
	const formulas = await client.getFormulas();
	if (formulas.length === 0) {
		vscode.window.showInformationMessage('No formulas available.');
		return;
	}

	const selected = await vscode.window.showQuickPick(
		formulas.map(f => ({
			label: f.name,
			description: `${f.steps} steps`,
			detail: f.description,
			formula: f,
		})),
		{ placeHolder: 'Select formula to cook' },
	);
	if (!selected) { return; }

	try {
		const output = await client.cookMolecule(selected.formula.id);
		vscode.window.showInformationMessage(`Cooked molecule from formula "${selected.formula.name}": ${output}`);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to cook molecule: ${msg}`);
	}
}

export async function pourWorkflow(client: GtClient): Promise<void> {
	const molecules = await client.getWorkflows();
	const runnable = molecules.filter(m => m.status === 'pending' || m.status === 'paused');
	if (runnable.length === 0) {
		vscode.window.showInformationMessage('No molecules ready to pour.');
		return;
	}

	const selected = await vscode.window.showQuickPick(
		runnable.map(m => ({
			label: m.formula_name || m.id,
			description: m.status,
			detail: `Progress: ${m.progress.completed}/${m.progress.total}`,
			molecule: m,
		})),
		{ placeHolder: 'Select molecule to pour' },
	);
	if (!selected) { return; }

	const rigs = await client.getRigs();
	let rigName: string | undefined;

	if (rigs.length === 0) {
		rigName = await vscode.window.showInputBox({ prompt: 'Rig name', placeHolder: 'myproject' });
	} else if (rigs.length === 1) {
		rigName = rigs[0].name;
	} else {
		rigName = await vscode.window.showQuickPick(rigs.map(r => r.name), { placeHolder: 'Select rig' });
	}
	if (!rigName) { return; }

	try {
		await client.pourMolecule(selected.molecule.id, rigName);
		vscode.window.showInformationMessage(`Poured molecule ${selected.molecule.id} on ${rigName}`);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to pour molecule: ${msg}`);
	}
}
