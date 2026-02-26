/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient, DOLT_PORT } from '../gtClient';

export async function ensureDolt(client: GtClient): Promise<boolean> {
	const up = await client.isDoltRunning(DOLT_PORT);

	if (up) {
		return true;
	}

	const message = 'Dolt server is not reachable. This operation requires Dolt to be running.';
	const choice = await vscode.window.showWarningMessage(message, 'Start Dolt', 'Cancel');
	if (choice !== 'Start Dolt') {
		return false;
	}

	try {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Starting Dolt…' },
			async () => {
				await client.stopDolt();
				await client.startDolt();
			},
		);
	} catch (err: any) {
		vscode.window.showErrorMessage(`Failed to start Dolt: ${err.message}`);
		return false;
	}

	const afterUp = await client.isDoltRunning(DOLT_PORT);
	if (!afterUp) {
		vscode.window.showErrorMessage('Dolt started but is not responding. Try running `gt dolt start` manually.');
		return false;
	}
	return true;
}
