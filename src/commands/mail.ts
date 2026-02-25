/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';
import type { GtMailMessage } from '../cli/contracts';

export async function showMailMessage(client: GtClient, message?: GtMailMessage): Promise<void> {
	if (!message) {
		const inbox = await client.getMailInbox();
		if (inbox.length === 0) {
			vscode.window.showInformationMessage('No mail.');
			return;
		}
		const selected = await vscode.window.showQuickPick(
			inbox.map(m => ({
				label: `${m.read ? '' : '● '}${m.subject}`,
				description: `from ${m.from}`,
				detail: `${m.priority} · ${m.type} · ${m.timestamp}`,
				message: m,
			})),
			{ placeHolder: 'Select message' },
		);
		if (!selected) { return; }
		message = selected.message;
	}

	if (!message.read) {
		try { await client.markMailRead(message.id); } catch { /* best effort */ }
	}

	const md = [
		`# ${message.subject}`,
		'',
		`| | |`,
		`|---|---|`,
		`| **From** | ${message.from} |`,
		`| **To** | ${message.to} |`,
		`| **Priority** | ${message.priority} |`,
		`| **Type** | ${message.type} |`,
		`| **Time** | ${message.timestamp} |`,
		'',
		'---',
		'',
		message.body,
	].join('\n');

	const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
	await vscode.window.showTextDocument(doc, { preview: true });
}

export async function composeMail(client: GtClient): Promise<void> {
	const to = await vscode.window.showInputBox({ prompt: 'To (agent address)', placeHolder: 'agent-name' });
	if (!to) { return; }

	const subject = await vscode.window.showInputBox({ prompt: 'Subject' });
	if (!subject) { return; }

	const body = await vscode.window.showInputBox({ prompt: 'Body' });
	if (!body) { return; }

	const priority = await vscode.window.showQuickPick(
		['normal', 'low', 'high', 'urgent'],
		{ placeHolder: 'Priority' },
	) || 'normal';

	try {
		await client.sendMail(to, subject, body, priority);
		vscode.window.showInformationMessage(`Mail sent to ${to}`);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to send mail: ${msg}`);
	}
}
