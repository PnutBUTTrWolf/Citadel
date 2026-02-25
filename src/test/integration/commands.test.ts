/*---------------------------------------------------------------------------------------------
 *  Integration tests for command handlers.
 *
 *  Tests sling and bead create flows by stubbing vscode.window methods
 *  (QuickPick, InputBox) and verifying correct GtClient calls.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { slingBead } from '../../commands/sling';
import { createBead, showBeadDetails, deleteBead } from '../../commands/bead';
import { MockGtClient, makeBead, makeRig } from './helper';

suite('Command Handlers', () => {
	let mockClient: MockGtClient;

	// Save originals for restore after each test
	const originalShowQuickPick = vscode.window.showQuickPick;
	const originalShowInputBox = vscode.window.showInputBox;
	const originalShowWarningMessage = vscode.window.showWarningMessage;
	const originalShowInformationMessage = vscode.window.showInformationMessage;

	setup(() => {
		mockClient = new MockGtClient();
	});

	teardown(() => {
		// Restore all stubs
		(vscode.window as any).showQuickPick = originalShowQuickPick;
		(vscode.window as any).showInputBox = originalShowInputBox;
		(vscode.window as any).showWarningMessage = originalShowWarningMessage;
		(vscode.window as any).showInformationMessage = originalShowInformationMessage;
	});

	suite('slingBead', () => {
		test('should sling bead with prefilled ID and single rig', async () => {
			mockClient.rigs = [makeRig({ name: 'my-rig' })];

			// Stub: agent runtime selection returns default
			(vscode.window as any).showQuickPick = async () => '(default)';
			// Stub: info message (called on success)
			(vscode.window as any).showInformationMessage = async () => undefined;

			const result = await slingBead(mockClient as any, 'ct-abc');

			assert.ok(result, 'Expected a SlingResult');
			assert.strictEqual(result!.beadId, 'ct-abc');
			assert.strictEqual(result!.rigName, 'my-rig');
			assert.ok(mockClient.wasCalled('slingBead'), 'Expected slingBead to be called on client');
		});

		test('should sling bead with specific agent runtime', async () => {
			mockClient.rigs = [makeRig({ name: 'my-rig' })];

			(vscode.window as any).showQuickPick = async () => 'claude';
			(vscode.window as any).showInformationMessage = async () => undefined;

			const result = await slingBead(mockClient as any, 'ct-xyz');

			assert.ok(result);
			const call = mockClient.callsFor('slingBead')[0];
			assert.strictEqual(call.args[2], 'claude', 'Expected agent override to be "claude"');
		});

		test('should return undefined when no bead ID and QuickPick cancelled', async () => {
			mockClient.beads = [makeBead({ id: 'ct-1', status: 'pending' })];

			// Cancel the bead QuickPick
			(vscode.window as any).showQuickPick = async () => undefined;

			const result = await slingBead(mockClient as any);
			assert.strictEqual(result, undefined);
		});

		test('should pick bead from QuickPick when no prefilled ID', async () => {
			mockClient.beads = [
				makeBead({ id: 'ct-1', title: 'Task A', status: 'pending' }),
				makeBead({ id: 'ct-2', title: 'Task B', status: 'pending' }),
			];
			mockClient.rigs = [makeRig({ name: 'my-rig' })];

			let quickPickCallCount = 0;
			(vscode.window as any).showQuickPick = async (items: any[]) => {
				quickPickCallCount++;
				if (quickPickCallCount === 1) {
					// First call: bead selection
					return items[0]; // Pick first bead
				}
				// Second call: agent runtime
				return '(default)';
			};
			(vscode.window as any).showInformationMessage = async () => undefined;

			const result = await slingBead(mockClient as any);
			assert.ok(result, 'Expected a SlingResult');
			assert.strictEqual(result!.beadId, 'ct-1');
		});

		test('should select rig from QuickPick when multiple rigs exist', async () => {
			mockClient.rigs = [
				makeRig({ name: 'rig-a' }),
				makeRig({ name: 'rig-b' }),
			];

			let quickPickCallCount = 0;
			(vscode.window as any).showQuickPick = async (items: any[]) => {
				quickPickCallCount++;
				if (quickPickCallCount === 1) {
					// First call: rig selection (items are strings)
					return 'rig-b';
				}
				// Second call: agent runtime
				return '(default)';
			};
			(vscode.window as any).showInformationMessage = async () => undefined;

			const result = await slingBead(mockClient as any, 'ct-abc');
			assert.ok(result);
			assert.strictEqual(result!.rigName, 'rig-b');
		});

		test('should return undefined when no rigs and input cancelled', async () => {
			mockClient.rigs = [];

			(vscode.window as any).showInputBox = async () => undefined;

			const result = await slingBead(mockClient as any, 'ct-abc');
			assert.strictEqual(result, undefined);
		});
	});

	suite('createBead', () => {
		test('should create bead with valid title', async () => {
			(vscode.window as any).showInputBox = async () => 'New test task';
			(vscode.window as any).showInformationMessage = async () => undefined;

			await createBead(mockClient as any);

			assert.ok(mockClient.wasCalled('createBead'), 'Expected createBead to be called');
			const call = mockClient.callsFor('createBead')[0];
			assert.strictEqual(call.args[0], 'New test task');
		});

		test('should not create bead when input is cancelled', async () => {
			(vscode.window as any).showInputBox = async () => undefined;

			await createBead(mockClient as any);

			assert.ok(!mockClient.wasCalled('createBead'), 'createBead should not be called when cancelled');
		});
	});

	suite('showBeadDetails', () => {
		test('should show bead details in a document', async () => {
			await showBeadDetails(mockClient as any, 'ct-test1');

			assert.ok(mockClient.wasCalled('showBead'), 'Expected showBead to be called');
			const call = mockClient.callsFor('showBead')[0];
			assert.strictEqual(call.args[0], 'ct-test1');
		});

		test('should prompt for bead selection when no ID provided', async () => {
			mockClient.beads = [
				makeBead({ id: 'ct-1', title: 'Task A' }),
			];

			(vscode.window as any).showQuickPick = async (items: any[]) => {
				return items[0]; // Pick first bead
			};

			await showBeadDetails(mockClient as any);

			assert.ok(mockClient.wasCalled('showBead'));
		});
	});

	suite('deleteBead', () => {
		test('should delete bead after confirmation', async () => {
			// Stub: confirm deletion
			(vscode.window as any).showWarningMessage = async () => 'Delete';
			(vscode.window as any).showInformationMessage = async () => undefined;

			await deleteBead(mockClient as any, 'ct-del1');

			assert.ok(mockClient.wasCalled('deleteBead'), 'Expected deleteBead to be called');
			const call = mockClient.callsFor('deleteBead')[0];
			assert.strictEqual(call.args[0], 'ct-del1');
		});

		test('should not delete bead when confirmation cancelled', async () => {
			(vscode.window as any).showWarningMessage = async () => undefined;

			await deleteBead(mockClient as any, 'ct-del1');

			assert.ok(!mockClient.wasCalled('deleteBead'), 'deleteBead should not be called when cancelled');
		});
	});
});
