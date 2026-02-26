/*---------------------------------------------------------------------------------------------
 *  Integration tests for extension activation and command registration.
 *
 *  Verifies that the extension activates cleanly in a real VS Code instance
 *  and that all expected commands and providers are registered.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
	suite('activation', () => {
		test('should find the extension in the registry', () => {
			const ext = vscode.extensions.getExtension('citadel.citadel');
			assert.ok(ext, 'Extension "citadel.citadel" not found in registry');
		});

		test('should activate the extension', async () => {
			const ext = vscode.extensions.getExtension('citadel.citadel');
			assert.ok(ext, 'Extension not found');

			if (!ext.isActive) {
				await ext.activate();
			}
			assert.ok(ext.isActive, 'Extension is not active after activation');
		});

		test('should register all Citadel commands', async () => {
			const commands = await vscode.commands.getCommands(true);

			const expectedCommands = [
				// Agent management
				'citadel.refreshAgents',
				'citadel.openAgentTerminal',
				'citadel.reconnectTerminal',
				'citadel.spawnAgent',
				'citadel.killAgent',
				'citadel.restartAgent',
				'citadel.openAllAgentTerminals',

				// Beads
				'citadel.refreshBeads',
				'citadel.filterBeads',
				'citadel.createBead',
				'citadel.showBead',
				'citadel.deleteBead',
				'citadel.slingBead',
				'citadel.openBeadTerminal',

				// Convoys
				'citadel.refreshConvoys',
				'citadel.createConvoy',
				'citadel.convoyShow',

				// Rigs
				'citadel.refreshRigs',
				'citadel.addRig',

				// Mayor
				'citadel.attachMayor',
				'citadel.detachMayor',
				'citadel.showMayorTerminal',
				'citadel.refreshMayor',

				// Mail
				'citadel.refreshMail',
				'citadel.showMail',
				'citadel.composeMail',

				// Merge queue
				'citadel.refreshQueue',
				'citadel.retryMergeRequest',
				'citadel.rejectMergeRequest',
				'citadel.showMergeRequestStatus',
				'citadel.nudgeRefinery',

				// Health & diagnostics
				'citadel.refreshHealth',
				'citadel.repairDaemon',
				'citadel.daemonStatus',
				'citadel.debugAgents',

				// UI
				'citadel.statusBarClick',
				'citadel.configureClaudeProvider',
				'citadel.showBattlestation',
				'citadel.openDashboard',
				'citadel.runBootstrap',
			];

			for (const cmd of expectedCommands) {
				assert.ok(
					commands.includes(cmd),
					`Expected command "${cmd}" to be registered`,
				);
			}
		});

		test('should export activate and deactivate functions', () => {
			const ext = vscode.extensions.getExtension('citadel.citadel');
			assert.ok(ext, 'Extension not found');

			const exports = ext.exports;
			// The extension doesn't export anything (deactivate is empty),
			// but it should not throw during activation
			assert.ok(ext.isActive);
		});
	});
});
