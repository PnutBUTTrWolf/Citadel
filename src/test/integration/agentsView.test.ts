/*---------------------------------------------------------------------------------------------
 *  Integration tests for AgentsTreeProvider.
 *
 *  Tests the tree structure, grouping, agent detail expansion, and badge
 *  callback behavior using a mocked GtClient inside a real VS Code instance.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { AgentsTreeProvider, GroupTreeItem, AgentTreeItem } from '../../views/agentsView';
import { MockGtClient, makeAgent } from './helper';

suite('AgentsTreeProvider', () => {
	let mockClient: MockGtClient;
	let provider: AgentsTreeProvider;

	setup(() => {
		mockClient = new MockGtClient();
		provider = new AgentsTreeProvider(mockClient as any);
	});

	suite('root level grouping', () => {
		test('should return Workers and Infrastructure groups', async () => {
			mockClient.agents = [
				makeAgent({ name: 'polecat-1', role: 'polecat', running: true }),
				makeAgent({ name: 'witness-1', role: 'witness', running: true }),
			];

			const children = await provider.getChildren();
			assert.strictEqual(children.length, 2, 'Expected 2 groups (Workers + Infrastructure)');

			const workers = children[0] as GroupTreeItem;
			assert.ok(workers instanceof GroupTreeItem);
			assert.strictEqual(workers.groupKind, 'workers');

			const infra = children[1] as GroupTreeItem;
			assert.ok(infra instanceof GroupTreeItem);
			assert.strictEqual(infra.groupKind, 'infrastructure');
		});

		test('should return only Workers group when no infrastructure agents exist', async () => {
			mockClient.agents = [
				makeAgent({ name: 'polecat-1', role: 'polecat' }),
				makeAgent({ name: 'polecat-2', role: 'crew' }),
			];

			const children = await provider.getChildren();
			assert.strictEqual(children.length, 1, 'Expected only Workers group');
			assert.strictEqual((children[0] as GroupTreeItem).groupKind, 'workers');
		});

		test('should classify all infrastructure roles correctly', async () => {
			mockClient.agents = [
				makeAgent({ name: 'mayor-1', role: 'mayor' }),
				makeAgent({ name: 'deacon-1', role: 'deacon' }),
				makeAgent({ name: 'witness-1', role: 'witness' }),
				makeAgent({ name: 'refinery-1', role: 'refinery' }),
				makeAgent({ name: 'dog-1', role: 'dog' }),
				makeAgent({ name: 'polecat-1', role: 'polecat' }),
			];

			const children = await provider.getChildren();
			assert.strictEqual(children.length, 2);

			const workers = children[0] as GroupTreeItem;
			assert.strictEqual(workers.agents.length, 1, 'Only 1 worker (polecat)');

			const infra = children[1] as GroupTreeItem;
			assert.strictEqual(infra.agents.length, 5, '5 infrastructure agents');
		});
	});

	suite('group children', () => {
		test('should return agent items for a populated group', async () => {
			const agents = [
				makeAgent({ name: 'polecat-1', role: 'polecat' }),
				makeAgent({ name: 'polecat-2', role: 'polecat' }),
			];
			const group = new GroupTreeItem('workers', agents, vscode.TreeItemCollapsibleState.Expanded);
			const children = await provider.getChildren(group);

			assert.strictEqual(children.length, 2);
			assert.ok(children[0] instanceof AgentTreeItem);
			assert.strictEqual((children[0] as AgentTreeItem).agent.name, 'polecat-1');
			assert.strictEqual((children[1] as AgentTreeItem).agent.name, 'polecat-2');
		});

		test('should return placeholder for empty workers group', async () => {
			const group = new GroupTreeItem('workers', [], vscode.TreeItemCollapsibleState.None);
			const children = await provider.getChildren(group);

			assert.strictEqual(children.length, 1);
			const placeholder = children[0] as AgentTreeItem;
			assert.ok(placeholder instanceof AgentTreeItem);
			assert.strictEqual(placeholder.agent.name, '(none running)');
			assert.strictEqual(placeholder.isDetail, true);
		});
	});

	suite('agent details', () => {
		test('should return all detail items for a fully-populated agent', async () => {
			const agent = makeAgent({
				name: 'polecat-1',
				currentTask: 'Working on ct-123',
				rig: 'test-rig',
				role: 'polecat',
				polecatState: 'working',
				beadId: 'ct-123',
				address: 'test-rig/polecat/polecat-1',
				session: 'tmux-session-1',
				unreadMail: 3,
				pid: 12345,
			});

			const item = new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
			const children = await provider.getChildren(item);

			// Task, Rig, Role, State, Bead, Address, Session, Mail, PID = 9 items
			assert.strictEqual(children.length, 9);

			const labels = children.map(c => (c as AgentTreeItem).agent.name);
			assert.ok(labels.some(l => l.startsWith('Task:')), 'Missing Task detail');
			assert.ok(labels.some(l => l.startsWith('Rig:')), 'Missing Rig detail');
			assert.ok(labels.some(l => l.startsWith('Role:')), 'Missing Role detail');
			assert.ok(labels.some(l => l.startsWith('State:')), 'Missing State detail');
			assert.ok(labels.some(l => l.startsWith('Bead:')), 'Missing Bead detail');
			assert.ok(labels.some(l => l.startsWith('Address:')), 'Missing Address detail');
			assert.ok(labels.some(l => l.startsWith('Session:')), 'Missing Session detail');
			assert.ok(labels.some(l => l.startsWith('Mail:')), 'Missing Mail detail');
			assert.ok(labels.some(l => l.startsWith('PID:')), 'Missing PID detail');
		});

		test('should return minimal details for a sparse agent', async () => {
			const agent = makeAgent({
				name: 'simple',
				role: 'polecat',
				rig: 'test-rig',
				currentTask: undefined,
				polecatState: undefined,
				beadId: undefined,
				address: undefined,
				session: undefined,
				unreadMail: undefined,
				pid: undefined,
			});

			const item = new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
			const children = await provider.getChildren(item);

			// Only Rig + Role are always present
			assert.ok(children.length >= 2, `Expected at least 2 detail items, got ${children.length}`);
			const labels = children.map(c => (c as AgentTreeItem).agent.name);
			assert.ok(labels.some(l => l.startsWith('Role:')), 'Missing Role detail');
		});

		test('should return empty array for detail items', async () => {
			const agent = makeAgent();
			const item = new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.None, true);
			const children = await provider.getChildren(item);
			assert.strictEqual(children.length, 0);
		});
	});

	suite('running count badge', () => {
		test('should fire callback with running agent count', async () => {
			let receivedCount = -1;
			provider.onRunningCountChanged = (count) => { receivedCount = count; };

			mockClient.agents = [
				makeAgent({ name: 'a1', running: true }),
				makeAgent({ name: 'a2', running: true }),
				makeAgent({ name: 'a3', running: false, displayStatus: 'exited' }),
			];

			await provider.getChildren();
			assert.strictEqual(receivedCount, 2);
		});

		test('should fire callback with 0 when no agents are running', async () => {
			// First call with running agents to set initial count
			let receivedCount = -1;
			provider.onRunningCountChanged = (count) => { receivedCount = count; };

			mockClient.agents = [makeAgent({ name: 'a1', running: true })];
			await provider.getChildren();
			assert.strictEqual(receivedCount, 1);

			// Second call with no running agents
			mockClient.agents = [makeAgent({ name: 'a1', running: false, displayStatus: 'exited' })];
			await provider.getChildren();
			assert.strictEqual(receivedCount, 0);
		});
	});

	suite('GroupTreeItem', () => {
		test('should display running/total count when some agents are running', () => {
			const agents = [
				makeAgent({ name: 'a1', running: true }),
				makeAgent({ name: 'a2', running: true }),
				makeAgent({ name: 'a3', running: false }),
			];
			const group = new GroupTreeItem('workers', agents, vscode.TreeItemCollapsibleState.Expanded);
			assert.strictEqual(group.description, '2/3 running');
		});

		test('should display just total count when no agents are running', () => {
			const agents = [
				makeAgent({ name: 'a1', running: false }),
			];
			const group = new GroupTreeItem('workers', agents, vscode.TreeItemCollapsibleState.None);
			assert.strictEqual(group.description, '1');
		});

		test('should use server-process icon for workers', () => {
			const group = new GroupTreeItem('workers', [], vscode.TreeItemCollapsibleState.None);
			assert.ok(group.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((group.iconPath as vscode.ThemeIcon).id, 'server-process');
		});

		test('should use tools icon for infrastructure', () => {
			const group = new GroupTreeItem('infrastructure', [], vscode.TreeItemCollapsibleState.None);
			assert.ok(group.iconPath instanceof vscode.ThemeIcon);
			assert.strictEqual((group.iconPath as vscode.ThemeIcon).id, 'tools');
		});
	});

	suite('AgentTreeItem', () => {
		test('should have agent contextValue', () => {
			const agent = makeAgent();
			const item = new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
			assert.strictEqual(item.contextValue, 'agent');
		});

		test('should have click command to open terminal', () => {
			const agent = makeAgent();
			const item = new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
			assert.ok(item.command, 'Missing click command');
			assert.strictEqual(item.command!.command, 'citadel.openAgentTerminal');
		});

		test('should show polecatState in description when available', () => {
			const agent = makeAgent({ polecatState: 'working', beadId: 'ct-123' });
			const item = new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
			const desc = item.description as string;
			assert.ok(desc.includes('working'), `Expected "working" in description: "${desc}"`);
		});

		test('should show displayStatus when no polecatState', () => {
			const agent = makeAgent({ polecatState: undefined, displayStatus: 'running' });
			const item = new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
			const desc = item.description as string;
			assert.ok(desc.includes('running'), `Expected "running" in description: "${desc}"`);
		});

		test('should include beadId in description', () => {
			const agent = makeAgent({ beadId: 'ct-xyz' });
			const item = new AgentTreeItem(agent, vscode.TreeItemCollapsibleState.Collapsed);
			const desc = item.description as string;
			assert.ok(desc.includes('ct-xyz'), `Expected "ct-xyz" in description: "${desc}"`);
		});

		test('detail items should have agentDetail contextValue', () => {
			const agent = makeAgent();
			const detail = AgentTreeItem.detail(agent, 'Role: polecat', 'symbol-class');
			assert.strictEqual(detail.contextValue, 'agentDetail');
			assert.strictEqual(detail.isDetail, true);
		});
	});
});
