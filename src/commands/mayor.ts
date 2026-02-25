/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GtClient } from '../gtClient';

export async function detachMayor(client: GtClient): Promise<void> {
	try {
		await client.detachMayor();
		vscode.window.showInformationMessage('Mayor stopped');
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to stop Mayor: ${msg}`);
	}
}
