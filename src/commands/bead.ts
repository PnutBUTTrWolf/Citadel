/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import { ensureDolt } from './doltPreflight';

export async function createBead(client: GtClient): Promise<void> {
	const title = await vscode.window.showInputBox({
		prompt: 'Describe the task for this bead',
		placeHolder: 'e.g., Add user authentication to the API',
		validateInput: (value) => {
			if (!value.trim()) {
				return 'A description is required';
			}
			return null;
		},
	});

	if (!title) {
		return;
	}

	if (!(await ensureDolt(client))) {
		return;
	}

	try {
		const output = await client.createBead(title.trim());
		const idMatch = output.match(/([a-z]+-[a-z0-9]+)/i);
		const beadId = idMatch ? idMatch[1] : '';
		const msg = beadId
			? `Created bead ${beadId}: "${title}"`
			: `Created bead: "${title}"`;
		vscode.window.showInformationMessage(msg);
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to create bead: ${err.message}`);
	}
}

export async function showBeadDetails(client: GtClient, beadId?: string): Promise<void> {
	if (!beadId) {
		const beads = await client.listBeads();
		if (beads.length === 0) {
			vscode.window.showInformationMessage('No beads found. Create one first.');
			return;
		}

		const selected = await vscode.window.showQuickPick(
			beads.map(b => ({
				label: b.title || b.id,
				description: b.status,
				detail: `ID: ${b.id}${b.assignee ? ` | Assignee: ${b.assignee}` : ''}`,
				id: b.id,
			})),
			{ placeHolder: 'Select bead to inspect' },
		);

		if (!selected) {
			return;
		}
		beadId = selected.id;
	}

	try {
		const raw = await client.showBead(beadId);
		const md = formatBeadAsMarkdown(beadId, raw);
		const doc = await vscode.workspace.openTextDocument({
			content: md,
			language: 'markdown',
		});
		await vscode.window.showTextDocument(doc, { preview: true });
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to show bead: ${err.message}`);
	}
}

function formatBeadAsMarkdown(beadId: string, raw: string): string {
	const lines = raw.split('\n');
	const fields: Record<string, string> = {};
	const bodyLines: string[] = [];
	let inBody = false;

	for (const line of lines) {
		if (inBody) {
			bodyLines.push(line);
			continue;
		}
		const kvMatch = line.match(/^(\w[\w\s]*?):\s+(.+)$/);
		if (kvMatch) {
			fields[kvMatch[1].trim().toLowerCase()] = kvMatch[2].trim();
		} else if (line.trim() === '' && Object.keys(fields).length > 0) {
			inBody = true;
		} else if (line.trim()) {
			bodyLines.push(line);
		}
	}

	const title = fields['title'] || fields['summary'] || beadId;
	const status = fields['status'] || 'unknown';
	const assignee = fields['assignee'] || fields['agent'] || 'unassigned';

	const parts: string[] = [];
	parts.push(`# ${title}\n`);
	parts.push(`| Field | Value |`);
	parts.push(`|-------|-------|`);
	parts.push(`| **ID** | \`${beadId}\` |`);
	parts.push(`| **Status** | ${status} |`);
	parts.push(`| **Assignee** | ${assignee} |`);

	for (const [key, value] of Object.entries(fields)) {
		if (['title', 'summary', 'status', 'assignee', 'agent', 'id'].includes(key)) {
			continue;
		}
		const label = key.charAt(0).toUpperCase() + key.slice(1);
		parts.push(`| **${label}** | ${value} |`);
	}

	parts.push('');

	if (bodyLines.length > 0) {
		const body = bodyLines.join('\n').trim();
		if (body) {
			parts.push(`## Details\n`);
			parts.push(body);
		}
	}

	if (!bodyLines.some(l => l.trim())) {
		parts.push(`## Raw Output\n`);
		parts.push('```');
		parts.push(raw);
		parts.push('```');
	}

	return parts.join('\n');
}

export async function deleteBead(client: GtClient, beadId?: string): Promise<void> {
	if (!beadId) {
		const beads = await client.listBeads();
		if (beads.length === 0) {
			vscode.window.showInformationMessage('No beads to delete.');
			return;
		}

		const selected = await vscode.window.showQuickPick(
			beads.map(b => ({
				label: b.title || b.id,
				description: b.status,
				detail: `ID: ${b.id}`,
				id: b.id,
			})),
			{ placeHolder: 'Select bead to delete' },
		);

		if (!selected) {
			return;
		}
		beadId = selected.id;
	}

	const confirm = await vscode.window.showWarningMessage(
		`Delete bead "${beadId}"?`, { modal: true }, 'Delete',
	);
	if (confirm !== 'Delete') {
		return;
	}

	if (!(await ensureDolt(client))) {
		return;
	}

	try {
		await client.deleteBead(beadId);
		vscode.window.showInformationMessage(`Deleted bead "${beadId}"`);
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to delete bead: ${err.message}`);
	}
}
