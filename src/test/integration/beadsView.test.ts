/*---------------------------------------------------------------------------------------------
 *  Integration tests for BeadsTreeProvider.
 *
 *  Tests section organization (Epics, Active Work, System), filter modes,
 *  bead categorization, and item properties using a mocked GtClient.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { BeadsTreeProvider, BeadSectionItem, BeadViewItem } from '../../views/beadsView';
import { MockGtClient, makeBead } from './helper';

suite('BeadsTreeProvider', () => {
	let mockClient: MockGtClient;
	let provider: BeadsTreeProvider;

	setup(() => {
		mockClient = new MockGtClient();
		provider = new BeadsTreeProvider(mockClient as any);
	});

	suite('root level sections', () => {
		test('should return Active Work section for regular beads', async () => {
			mockClient.beads = [
				makeBead({ id: 'ct-1', title: 'Task one', status: 'pending' }),
				makeBead({ id: 'ct-2', title: 'Task two', status: 'in_progress' }),
			];

			const children = await provider.getChildren();
			assert.ok(children.length >= 1, 'Expected at least 1 section');

			const activeSection = children.find(
				c => c instanceof BeadSectionItem && c.sectionLabel === 'Active Work',
			) as BeadSectionItem | undefined;
			assert.ok(activeSection, 'Expected Active Work section');
			assert.strictEqual(activeSection!.beads.length, 2);
		});

		test('should return Epics section for epic beads', async () => {
			mockClient.beads = [
				makeBead({ id: 'ct-epic1', title: 'Epic one', issue_type: 'epic', status: 'open' }),
				makeBead({ id: 'ct-1', title: 'Task one', status: 'pending' }),
			];

			const children = await provider.getChildren();
			const epicSection = children.find(
				c => c instanceof BeadSectionItem && c.sectionLabel === 'Epics',
			) as BeadSectionItem | undefined;
			assert.ok(epicSection, 'Expected Epics section');
			assert.strictEqual(epicSection!.beads.length, 1);
			assert.strictEqual(epicSection!.beads[0].id, 'ct-epic1');
		});

		test('should return System section for system beads', async () => {
			mockClient.beads = [
				makeBead({ id: 'ct-wisp-test', title: 'Wisp bead', status: 'open' }),
				makeBead({ id: 'ct-1', title: 'Task one', status: 'pending', issue_type: 'agent' }),
				makeBead({ id: 'ct-2', title: 'Task two', status: 'pending' }),
			];

			const children = await provider.getChildren();
			const systemSection = children.find(
				c => c instanceof BeadSectionItem && c.sectionLabel === 'System',
			) as BeadSectionItem | undefined;
			assert.ok(systemSection, 'Expected System section');
			// ct-wisp-test matches /wisp-/ pattern, ct-1 matches agent issue_type
			assert.strictEqual(systemSection!.beads.length, 2);
		});

		test('should show empty state when no beads exist', async () => {
			mockClient.beads = [];

			const children = await provider.getChildren();
			assert.strictEqual(children.length, 1);
			assert.ok(children[0].label?.toString().includes('No beads'));
		});
	});

	suite('filter modes', () => {
		test('should default to active filter mode', () => {
			assert.strictEqual(provider.filterMode, 'active');
		});

		test('should hide completed beads in active mode', async () => {
			mockClient.beads = [
				makeBead({ id: 'ct-1', title: 'Active task', status: 'pending' }),
				makeBead({ id: 'ct-2', title: 'Done task', status: 'completed' }),
				makeBead({ id: 'ct-3', title: 'Closed task', status: 'closed' }),
			];

			provider.setFilterMode('active');
			const children = await provider.getChildren();
			const activeSection = children.find(
				c => c instanceof BeadSectionItem && c.sectionLabel === 'Active Work',
			) as BeadSectionItem;
			assert.ok(activeSection, 'Expected Active Work section');
			assert.strictEqual(activeSection.beads.length, 1, 'Only pending bead should be visible');
			assert.strictEqual(activeSection.beads[0].id, 'ct-1');
		});

		test('should show all beads in all mode', async () => {
			mockClient.beads = [
				makeBead({ id: 'ct-1', title: 'Active task', status: 'pending' }),
				makeBead({ id: 'ct-2', title: 'Done task', status: 'completed' }),
				makeBead({ id: 'ct-3', title: 'Closed task', status: 'done' }),
			];

			provider.setFilterMode('all');
			const children = await provider.getChildren();
			const activeSection = children.find(
				c => c instanceof BeadSectionItem && c.sectionLabel === 'Active Work',
			) as BeadSectionItem;
			assert.ok(activeSection, 'Expected Active Work section');
			assert.strictEqual(activeSection.beads.length, 3, 'All beads should be visible');
		});

		test('should toggle filter mode', () => {
			assert.strictEqual(provider.filterMode, 'active');
			provider.setFilterMode('all');
			assert.strictEqual(provider.filterMode, 'all');
			provider.setFilterMode('active');
			assert.strictEqual(provider.filterMode, 'active');
		});
	});

	suite('section children', () => {
		test('should return bead items from section', async () => {
			const beads = [
				makeBead({ id: 'ct-1', title: 'Task one' }),
				makeBead({ id: 'ct-2', title: 'Task two' }),
			];
			const section = new BeadSectionItem('Active Work', beads, vscode.TreeItemCollapsibleState.Expanded, 'tasklist');

			const children = await provider.getChildren(section);
			assert.strictEqual(children.length, 2);
			assert.ok(children[0] instanceof BeadViewItem);
		});
	});

	suite('BeadViewItem', () => {
		test('should use bead title as label', () => {
			const bead = makeBead({ title: 'My task' });
			const item = new BeadViewItem(bead);
			assert.strictEqual(item.label, 'My task');
		});

		test('should fall back to ID when title is empty', () => {
			const bead = makeBead({ id: 'ct-123', title: '' });
			const item = new BeadViewItem(bead);
			assert.strictEqual(item.label, 'ct-123');
		});

		test('should have beadItem contextValue for unassigned beads', () => {
			const bead = makeBead({ status: 'pending', assignee: undefined });
			const item = new BeadViewItem(bead);
			assert.strictEqual(item.contextValue, 'beadItem');
		});

		test('should have beadItemAssigned contextValue for assigned beads', () => {
			const bead = makeBead({ status: 'in_progress', assignee: 'polecat-1' });
			const item = new BeadViewItem(bead);
			assert.strictEqual(item.contextValue, 'beadItemAssigned');
		});

		test('should click to show details for unassigned beads', () => {
			const bead = makeBead({ status: 'pending', assignee: undefined });
			const item = new BeadViewItem(bead);
			assert.ok(item.command);
			assert.strictEqual(item.command!.command, 'citadel.showBead');
		});

		test('should click to open terminal for assigned beads', () => {
			const bead = makeBead({ status: 'in_progress', assignee: 'polecat-1' });
			const item = new BeadViewItem(bead);
			assert.ok(item.command);
			assert.strictEqual(item.command!.command, 'citadel.openBeadTerminal');
		});

		test('should show assignee in description for assigned beads', () => {
			const bead = makeBead({ assignee: 'polecat-1' });
			const item = new BeadViewItem(bead);
			const desc = item.description as string;
			assert.ok(desc.includes('polecat-1'), `Expected assignee in description: "${desc}"`);
		});

		test('should show status in description for unassigned beads', () => {
			const bead = makeBead({ status: 'pending', assignee: undefined });
			const item = new BeadViewItem(bead);
			const desc = item.description as string;
			assert.ok(desc.includes('pending'), `Expected status in description: "${desc}"`);
		});

		test('should have check icon for completed beads', () => {
			const bead = makeBead({ status: 'completed' });
			const item = new BeadViewItem(bead);
			assert.ok(item.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'check');
		});

		test('should have loading icon for in-progress beads', () => {
			const bead = makeBead({ status: 'in_progress' });
			const item = new BeadViewItem(bead);
			assert.ok(item.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'loading~spin');
		});

		test('should have circle-outline icon for pending beads', () => {
			const bead = makeBead({ status: 'pending' });
			const item = new BeadViewItem(bead);
			assert.ok(item.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'circle-outline');
		});
	});

	suite('BeadSectionItem', () => {
		test('should include bead count in label', () => {
			const beads = [makeBead(), makeBead({ id: 'ct-2' })];
			const section = new BeadSectionItem('Active Work', beads, vscode.TreeItemCollapsibleState.Expanded, 'tasklist');
			assert.strictEqual(section.label, 'Active Work (2)');
		});

		test('should have beadSection contextValue', () => {
			const section = new BeadSectionItem('Epics', [], vscode.TreeItemCollapsibleState.Collapsed, 'telescope');
			assert.strictEqual(section.contextValue, 'beadSection');
		});
	});
});
