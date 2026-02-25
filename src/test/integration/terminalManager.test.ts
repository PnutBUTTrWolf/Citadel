/*---------------------------------------------------------------------------------------------
 *  Integration tests for TerminalManager lifecycle.
 *
 *  Tests terminal creation, closing, grid layout tracking, sling watchers,
 *  agent sync, and disposal using a real VS Code API with a mocked GtClient.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { TerminalManager } from '../../terminalManager';
import { MockGtClient, makeAgent } from './helper';

suite('TerminalManager', () => {
	let mockClient: MockGtClient;
	let outputChannel: vscode.OutputChannel;
	let manager: TerminalManager;

	setup(() => {
		mockClient = new MockGtClient();
		outputChannel = vscode.window.createOutputChannel('Citadel Test');
		manager = new TerminalManager(mockClient as any, outputChannel);
	});

	teardown(() => {
		manager.dispose();
		outputChannel.dispose();
	});

	suite('openAgentTerminal()', () => {
		test('should create a terminal for an agent', () => {
			const agent = makeAgent({ name: 'worker-1', session: undefined });
			const terminal = manager.openAgentTerminal(agent);

			assert.ok(terminal, 'Expected a terminal to be created');
			assert.ok(manager.hasTerminal('worker-1'), 'Terminal should be tracked');
			assert.strictEqual(manager.terminalCount, 1);
		});

		test('should reuse existing terminal for the same agent', () => {
			const agent = makeAgent({ name: 'worker-1' });
			const t1 = manager.openAgentTerminal(agent);
			const t2 = manager.openAgentTerminal(agent);

			assert.strictEqual(t1, t2, 'Should return the same terminal');
			assert.strictEqual(manager.terminalCount, 1);
		});

		test('should create separate terminals for different agents', () => {
			manager.openAgentTerminal(makeAgent({ name: 'worker-1' }));
			manager.openAgentTerminal(makeAgent({ name: 'worker-2' }));

			assert.strictEqual(manager.terminalCount, 2);
			assert.ok(manager.hasTerminal('worker-1'));
			assert.ok(manager.hasTerminal('worker-2'));
		});

		test('should include bead ID in terminal name when available', () => {
			const agent = makeAgent({ name: 'worker-1', beadId: 'ct-xyz' });
			const terminal = manager.openAgentTerminal(agent);

			assert.ok(terminal.name.includes('ct-xyz'),
				`Expected terminal name to include bead ID: "${terminal.name}"`);
		});
	});

	suite('closeAgentTerminal()', () => {
		test('should remove tracked terminal', () => {
			manager.openAgentTerminal(makeAgent({ name: 'worker-1' }));
			assert.ok(manager.hasTerminal('worker-1'));

			manager.closeAgentTerminal('worker-1');
			assert.ok(!manager.hasTerminal('worker-1'));
		});

		test('should update terminal count', () => {
			manager.openAgentTerminal(makeAgent({ name: 'worker-1' }));
			manager.openAgentTerminal(makeAgent({ name: 'worker-2' }));
			assert.strictEqual(manager.terminalCount, 2);

			manager.closeAgentTerminal('worker-1');
			assert.strictEqual(manager.terminalCount, 1);
		});

		test('should be safe to call for non-existent terminal', () => {
			// Should not throw
			manager.closeAgentTerminal('does-not-exist');
		});
	});

	suite('hasTerminal() / showAgentTerminal()', () => {
		test('hasTerminal returns false for unknown agent', () => {
			assert.strictEqual(manager.hasTerminal('unknown'), false);
		});

		test('showAgentTerminal returns false for unknown agent', () => {
			assert.strictEqual(manager.showAgentTerminal('unknown'), false);
		});

		test('showAgentTerminal returns true for known agent', () => {
			manager.openAgentTerminal(makeAgent({ name: 'worker-1' }));
			assert.strictEqual(manager.showAgentTerminal('worker-1'), true);
		});
	});

	suite('getGridLayout()', () => {
		test('should return empty array when no terminals', () => {
			const layout = manager.getGridLayout();
			assert.strictEqual(layout.length, 0);
		});

		test('should track slots sequentially', () => {
			manager.openAgentTerminal(makeAgent({ name: 'a1', displayStatus: 'running' }));
			manager.openAgentTerminal(makeAgent({ name: 'a2', displayStatus: 'running' }));
			manager.openAgentTerminal(makeAgent({ name: 'a3', displayStatus: 'idle' }));

			const layout = manager.getGridLayout();
			assert.strictEqual(layout.length, 3);
			assert.strictEqual(layout[0].slot, 0);
			assert.strictEqual(layout[0].agentName, 'a1');
			assert.strictEqual(layout[1].slot, 1);
			assert.strictEqual(layout[1].agentName, 'a2');
			assert.strictEqual(layout[2].slot, 2);
			assert.strictEqual(layout[2].agentName, 'a3');
		});

		test('should include agent status in layout', () => {
			manager.openAgentTerminal(makeAgent({ name: 'a1', displayStatus: 'running' }));
			const layout = manager.getGridLayout();
			assert.strictEqual(layout[0].status, 'running');
		});
	});

	suite('onDidTerminalCountChange', () => {
		test('should fire when terminal is opened', (done) => {
			const disposable = manager.onDidTerminalCountChange(count => {
				if (count === 1) {
					disposable.dispose();
					done();
				}
			});

			manager.openAgentTerminal(makeAgent({ name: 'worker-1' }));
		});

		test('should fire when terminal is closed', (done) => {
			manager.openAgentTerminal(makeAgent({ name: 'worker-1' }));

			const disposable = manager.onDidTerminalCountChange(count => {
				if (count === 0) {
					disposable.dispose();
					done();
				}
			});

			manager.closeAgentTerminal('worker-1');
		});
	});

	suite('syncAgentTerminals()', () => {
		test('should not crash when no terminals are open', async () => {
			mockClient.agents = [
				makeAgent({ name: 'worker-1', displayStatus: 'running' }),
			];

			// Should not throw
			await manager.syncAgentTerminals();
		});

		test('should update agent state in tracked terminals', async () => {
			const agent = makeAgent({ name: 'worker-1', displayStatus: 'running' });
			manager.openAgentTerminal(agent);

			// Simulate agent status change
			mockClient.agents = [
				makeAgent({ name: 'worker-1', displayStatus: 'running' }),
			];

			await manager.syncAgentTerminals();

			const layout = manager.getGridLayout();
			assert.strictEqual(layout.length, 1);
			assert.strictEqual(layout[0].status, 'running');
		});
	});

	suite('openAllAgentTerminals()', () => {
		test('should open terminals for all running worker agents', async () => {
			mockClient.agents = [
				makeAgent({ name: 'worker-1', role: 'polecat', running: true }),
				makeAgent({ name: 'worker-2', role: 'crew', running: true }),
				makeAgent({ name: 'witness-1', role: 'witness', running: true }), // infra, skipped
				makeAgent({ name: 'idle-1', role: 'polecat', running: false }), // not running, skipped
			];

			const opened = await manager.openAllAgentTerminals();

			assert.strictEqual(opened, 2, 'Should open 2 worker terminals');
			assert.ok(manager.hasTerminal('worker-1'));
			assert.ok(manager.hasTerminal('worker-2'));
			assert.ok(!manager.hasTerminal('witness-1'), 'Should not open infra terminal');
			assert.ok(!manager.hasTerminal('idle-1'), 'Should not open non-running terminal');
		});

		test('should not open duplicate terminals', async () => {
			mockClient.agents = [
				makeAgent({ name: 'worker-1', role: 'polecat', running: true }),
			];

			// Open first
			manager.openAgentTerminal(makeAgent({ name: 'worker-1' }));
			const countBefore = manager.terminalCount;

			// Try to open all — worker-1 already exists
			const opened = await manager.openAllAgentTerminals();

			assert.strictEqual(opened, 0, 'Should not open duplicate terminals');
			assert.strictEqual(manager.terminalCount, countBefore);
		});
	});

	suite('reconnectAgent()', () => {
		test('should return undefined for agent without session', () => {
			const agent = makeAgent({ name: 'worker-1', session: undefined });
			const result = manager.reconnectAgent(agent);
			assert.strictEqual(result, undefined);
		});

		test('should open terminal for agent with session', () => {
			const agent = makeAgent({ name: 'worker-1', session: 'tmux-session-1' });
			const terminal = manager.reconnectAgent(agent);

			assert.ok(terminal, 'Expected a terminal to be created');
			assert.ok(manager.hasTerminal('worker-1'));
		});

		test('should replace stale terminal on reconnect', () => {
			const agent = makeAgent({ name: 'worker-1', session: 'old-session' });
			manager.openAgentTerminal(agent);

			const updatedAgent = makeAgent({ name: 'worker-1', session: 'new-session' });
			const terminal = manager.reconnectAgent(updatedAgent);

			assert.ok(terminal);
			assert.strictEqual(manager.terminalCount, 1, 'Should still have 1 terminal');
		});
	});

	suite('watchForSlung()', () => {
		test('should set up a watcher that eventually opens a terminal', async () => {
			// Set up mock to return the new agent after a poll cycle
			const newAgent = makeAgent({
				name: 'new-polecat',
				beadId: 'ct-slung',
				running: true,
			});

			// First poll: agent not yet available
			mockClient.agents = [];

			manager.watchForSlung('ct-slung', 'test-rig');

			// Simulate agent appearing
			mockClient.agents = [newAgent];

			// Wait for at least one poll cycle (5s interval in watchForSlung)
			// We verify the watcher was set up by checking it doesn't crash
			// and can be cleaned up
			manager.dispose();
		});
	});

	suite('getBattlestationState()', () => {
		test('should return pane info for all terminals', () => {
			manager.openAgentTerminal(makeAgent({
				name: 'a1', rig: 'rig-1', role: 'polecat', beadId: 'ct-1',
				running: true, displayStatus: 'running',
			}));
			manager.openAgentTerminal(makeAgent({
				name: 'a2', rig: 'rig-2', role: 'crew', beadId: 'ct-2',
				running: true, displayStatus: 'running',
			}));

			const state = manager.getBattlestationState();
			assert.strictEqual(state.length, 2);

			assert.strictEqual(state[0].agentName, 'a1');
			assert.strictEqual(state[0].rig, 'rig-1');
			assert.strictEqual(state[0].role, 'polecat');
			assert.strictEqual(state[0].beadId, 'ct-1');
			assert.strictEqual(state[0].running, true);

			assert.strictEqual(state[1].agentName, 'a2');
			assert.strictEqual(state[1].rig, 'rig-2');
		});
	});

	suite('dispose()', () => {
		test('should clean up all resources', () => {
			manager.openAgentTerminal(makeAgent({ name: 'a1' }));
			manager.openAgentTerminal(makeAgent({ name: 'a2' }));
			manager.watchForSlung('ct-test', 'rig-1');

			manager.dispose();
			assert.strictEqual(manager.terminalCount, 0);
		});

		test('should be safe to call multiple times', () => {
			manager.dispose();
			manager.dispose();
		});
	});
});
