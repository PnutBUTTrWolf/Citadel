/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import { ensureDolt } from './doltPreflight';

export async function createConvoy(client: GtClient): Promise<void> {
	const name = await vscode.window.showInputBox({
		prompt: 'Convoy name',
		placeHolder: 'e.g., Auth System',
	});

	if (!name) {
		return;
	}

	const beadIdsRaw = await vscode.window.showInputBox({
		prompt: 'Bead IDs (space-separated)',
		placeHolder: 'gt-abc12 gt-def34 gt-ghi56',
	});

	const beadIds = beadIdsRaw ? beadIdsRaw.trim().split(/\s+/) : [];

	if (!(await ensureDolt(client))) {
		return;
	}

	try {
		await client.createConvoy(name, beadIds);
		vscode.window.showInformationMessage(`Created convoy "${name}" with ${beadIds.length} bead(s)`);
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to create convoy: ${err.message}`);
	}
}

export async function showConvoyDetails(client: GtClient, convoyId?: string): Promise<void> {
	if (!convoyId) {
		const convoys = await client.getConvoys();
		if (convoys.length === 0) {
			vscode.window.showInformationMessage('No active convoys');
			return;
		}

		const selected = await vscode.window.showQuickPick(
			convoys.map(c => ({
				label: c.title || c.id,
				description: `${c.progress.completed}/${c.progress.total}`,
				detail: `ID: ${c.id} | Status: ${c.status}`,
				id: c.id,
			})),
			{ placeHolder: 'Select convoy to inspect' }
		);

		if (!selected) {
			return;
		}
		convoyId = selected.id;
	}

	try {
		const output = await client.convoyShow(convoyId);
		const doc = await vscode.workspace.openTextDocument({
			content: output,
			language: 'plaintext',
		});
		await vscode.window.showTextDocument(doc, { preview: true });
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to show convoy: ${err.message}`);
	}
}
