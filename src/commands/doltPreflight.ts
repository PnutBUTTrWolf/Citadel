/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, DOLT_PORT_BD, DOLT_PORT_GT, doltPortLabel } from '../gtClient';

const DOLT_PORTS = [DOLT_PORT_BD, DOLT_PORT_GT];

async function portStatus(client: GtClient): Promise<{ all: boolean; any: boolean; down: number[] }> {
	const results = await Promise.all(DOLT_PORTS.map(async p => ({ port: p, up: await client.isDoltRunning(p) })));
	const down = results.filter(r => !r.up).map(r => r.port);
	return { all: down.length === 0, any: results.some(r => r.up), down };
}

export async function ensureDolt(client: GtClient): Promise<boolean> {
	const status = await portStatus(client);

	if (status.all) {
		return true;
	}

	// Some or all servers are down — offer to (re)start
	const downLabels = status.down.map(p => doltPortLabel(p)).join(', ');
	const message = status.any
		? `Dolt is partially running (${downLabels} server down). Restart to bring up all servers?`
		: 'Dolt server is not reachable. This operation requires Dolt to be running.';
	const action = status.any ? 'Restart Dolt' : 'Start Dolt';

	const choice = await vscode.window.showWarningMessage(message, action, 'Cancel');
	if (choice !== action) {
		// If partial, still usable — return true. If fully down, return false.
		return status.any;
	}

	try {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `${action}…` },
			async () => {
				await client.stopDolt();
				await client.startDolt();
			},
		);
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to start Dolt: ${err.message}`);
		return status.any;
	}

	const after = await portStatus(client);
	if (!after.all) {
		const stillDown = after.down.map(p => doltPortLabel(p)).join(', ');
		if (!after.any) {
			vscode.window.showErrorMessage('Dolt started but is not responding. Try running `gt dolt start` manually.');
			return false;
		}
		vscode.window.showWarningMessage(`Dolt partially running — ${stillDown} server still down.`);
	}
	return after.any;
}
