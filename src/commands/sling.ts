/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import { AGENT_RUNTIMES } from '../constants';
import { ensureDolt } from './doltPreflight';

async function pickBead(client: GtClient): Promise<string | undefined> {
	const beads = await client.listBeads();
	const slingable = beads.filter(b => !b.assignee && b.status === 'pending');

	if (slingable.length === 0) {
		vscode.window.showInformationMessage('No unassigned beads available to sling.');
		return undefined;
	}

	const items = slingable.map(b => ({
		label: b.title || b.id,
		description: b.id,
		beadId: b.id,
	}));

	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select a bead to sling',
	});

	return picked?.beadId;
}

export interface SlingResult {
	beadId: string;
	rigName: string;
}

export async function slingBead(client: GtClient, prefilledBeadId?: string): Promise<SlingResult | undefined> {
	const beadId = prefilledBeadId || await pickBead(client);
	if (!beadId) {
		return undefined;
	}

	const rigs = await client.getRigs();
	let rigName: string | undefined;

	if (rigs.length === 0) {
		rigName = await vscode.window.showInputBox({
			prompt: 'Enter rig name',
			placeHolder: 'myproject',
		});
	} else if (rigs.length === 1) {
		rigName = rigs[0].name;
	} else {
		rigName = await vscode.window.showQuickPick(
			rigs.map(r => r.name),
			{ placeHolder: 'Select target rig' }
		);
	}

	if (!rigName) {
		return undefined;
	}

	const agents = [...AGENT_RUNTIMES, '(default)'];
	const agentChoice = await vscode.window.showQuickPick(agents, {
		placeHolder: 'Select agent runtime (or use default)',
	});

	const agentOverride = agentChoice && agentChoice !== '(default)' ? agentChoice : undefined;

	if (!(await ensureDolt(client))) {
		return undefined;
	}

	try {
		await client.slingBead(beadId.trim(), rigName, agentOverride);
		vscode.window.showInformationMessage(`Slung bead ${beadId} to ${rigName}${agentOverride ? ` (agent: ${agentOverride})` : ''}`);
		return { beadId: beadId.trim(), rigName };
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to sling bead: ${err.message}`);
		return undefined;
	}
}
