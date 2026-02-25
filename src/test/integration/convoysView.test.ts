/*---------------------------------------------------------------------------------------------
 *  Integration tests for ConvoysTreeProvider.
 *
 *  Tests convoy listing, progress display, bead expansion,
 *  icon selection, and empty state handling.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConvoysTreeProvider, ConvoyTreeItem, BeadTreeItem } from '../../views/convoysView';
import { MockGtClient, makeConvoy, makeBead } from './helper';

suite('ConvoysTreeProvider', () => {
	let mockClient: MockGtClient;
	let provider: ConvoysTreeProvider;

	setup(() => {
		mockClient = new MockGtClient();
		provider = new ConvoysTreeProvider(mockClient as any);
	});

	suite('root level', () => {
		test('should return convoy items', async () => {
			mockClient.convoys = [
				makeConvoy({ id: 'cv-1', title: 'Sprint 1', progress: { completed: 2, total: 5 } }),
				makeConvoy({ id: 'cv-2', title: 'Sprint 2', progress: { completed: 0, total: 3 } }),
			];

			const children = await provider.getChildren();
			assert.strictEqual(children.length, 2);
			assert.ok(children[0] instanceof ConvoyTreeItem);
			assert.ok(children[1] instanceof ConvoyTreeItem);
		});

		test('should show empty state when no convoys exist', async () => {
			mockClient.convoys = [];

			const children = await provider.getChildren();
			assert.strictEqual(children.length, 1);
			assert.ok(children[0].label?.toString().includes('No active convoys'));
		});
	});

	suite('convoy children', () => {
		test('should return tracked bead items', async () => {
			const convoy = makeConvoy({
				id: 'cv-1',
				title: 'Test Convoy',
				tracked: [
					makeBead({ id: 'ct-1', title: 'Task 1', status: 'pending' }),
					makeBead({ id: 'ct-2', title: 'Task 2', status: 'in_progress', assignee: 'polecat-1' }),
					makeBead({ id: 'ct-3', title: 'Task 3', status: 'completed' }),
				],
				progress: { completed: 1, total: 3 },
			});
			const convoyItem = new ConvoyTreeItem(convoy);

			const children = await provider.getChildren(convoyItem);
			assert.strictEqual(children.length, 3);
			assert.ok(children[0] instanceof BeadTreeItem);
		});

		test('should not be expandable when no tracked beads', async () => {
			const convoy = makeConvoy({ tracked: [] });
			const convoyItem = new ConvoyTreeItem(convoy);
			assert.strictEqual(convoyItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
		});
	});

	suite('ConvoyTreeItem', () => {
		test('should display progress in description', () => {
			const convoy = makeConvoy({ progress: { completed: 3, total: 5 } });
			const item = new ConvoyTreeItem(convoy);
			assert.strictEqual(item.description, '3/5');
		});

		test('should have convoy contextValue', () => {
			const convoy = makeConvoy();
			const item = new ConvoyTreeItem(convoy);
			assert.strictEqual(item.contextValue, 'convoy');
		});

		test('should use pass-filled icon when all complete', () => {
			const convoy = makeConvoy({ progress: { completed: 3, total: 3 } });
			const item = new ConvoyTreeItem(convoy);
			assert.ok(item.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'pass-filled');
		});

		test('should use loading icon when partially complete', () => {
			const convoy = makeConvoy({ progress: { completed: 1, total: 3 } });
			const item = new ConvoyTreeItem(convoy);
			assert.ok(item.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'loading~spin');
		});

		test('should use tasklist icon when nothing complete', () => {
			const convoy = makeConvoy({ progress: { completed: 0, total: 3 } });
			const item = new ConvoyTreeItem(convoy);
			assert.ok(item.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'tasklist');
		});

		test('should use tasklist icon for empty convoy', () => {
			const convoy = makeConvoy({ progress: { completed: 0, total: 0 } });
			const item = new ConvoyTreeItem(convoy);
			assert.ok(item.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'tasklist');
		});

		test('should be expandable when it has tracked beads', () => {
			const convoy = makeConvoy({
				tracked: [makeBead({ id: 'ct-1' })],
			});
			const item = new ConvoyTreeItem(convoy);
			assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
		});
	});

	suite('BeadTreeItem', () => {
		test('should have bead contextValue', () => {
			const bead = makeBead();
			const item = new BeadTreeItem(bead);
			assert.strictEqual(item.contextValue, 'bead');
		});

		test('should show assignee in description when assigned', () => {
			const bead = makeBead({ assignee: 'polecat-1' });
			const item = new BeadTreeItem(bead);
			assert.ok((item.description as string).includes('polecat-1'));
		});

		test('should show status in description when unassigned', () => {
			const bead = makeBead({ status: 'pending', assignee: undefined });
			const item = new BeadTreeItem(bead);
			assert.strictEqual(item.description, 'pending');
		});

		test('should have click command for assigned beads', () => {
			const bead = makeBead({ assignee: 'polecat-1' });
			const item = new BeadTreeItem(bead);
			assert.ok(item.command, 'Expected click command for assigned bead');
			assert.strictEqual(item.command!.command, 'citadel.openAgentTerminal');
		});

		test('should not have click command for unassigned beads', () => {
			const bead = makeBead({ assignee: undefined });
			const item = new BeadTreeItem(bead);
			assert.strictEqual(item.command, undefined);
		});

		test('should have correct status icons', () => {
			const pending = new BeadTreeItem(makeBead({ status: 'pending' }));
			assert.strictEqual((pending.iconPath as vscode.ThemeIcon).id, 'circle-outline');

			const inProgress = new BeadTreeItem(makeBead({ status: 'in_progress' }));
			assert.strictEqual((inProgress.iconPath as vscode.ThemeIcon).id, 'loading~spin');

			const completed = new BeadTreeItem(makeBead({ status: 'completed' }));
			assert.strictEqual((completed.iconPath as vscode.ThemeIcon).id, 'check');

			const assigned = new BeadTreeItem(makeBead({ status: 'assigned' }));
			assert.strictEqual((assigned.iconPath as vscode.ThemeIcon).id, 'arrow-right');
		});
	});
});
