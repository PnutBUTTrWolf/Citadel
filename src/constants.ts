/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const INFRASTRUCTURE_ROLES = new Set([
	'mayor', 'deacon', 'witness', 'refinery', 'dog',
	'coordinator', 'health-check',
]);

/**
 * Maps CLI role names to the canonical role used internally.
 * The reference uses 'coordinator' for mayor and 'health-check' for deacon.
 */
export const CANONICAL_ROLE_MAP: Record<string, string> = {
	coordinator: 'mayor',
	'health-check': 'deacon',
};

/**
 * Polecat operational state from citadel source (internal/polecat/types.go).
 * There is NO idle state — polecats spawn, work, and get nuked.
 */
export type PolecatState = 'working' | 'done' | 'stuck';

/**
 * Derived display status for agents in the UI.
 */
export type AgentDisplayStatus =
	| 'running'
	| 'idle'
	| 'completing'
	| 'stuck'
	| 'dead'
	| 'exited';

export const AGENT_RUNTIMES = [
	'claude', 'codex', 'cursor', 'gemini', 'auggie', 'amp',
] as const;

export type AgentRuntime = (typeof AGENT_RUNTIMES)[number];

export const RIG_COLORS: vscode.ThemeColor[] = [
	new vscode.ThemeColor('terminal.ansiCyan'),
	new vscode.ThemeColor('terminal.ansiGreen'),
	new vscode.ThemeColor('terminal.ansiYellow'),
	new vscode.ThemeColor('terminal.ansiMagenta'),
	new vscode.ThemeColor('terminal.ansiBlue'),
	new vscode.ThemeColor('terminal.ansiRed'),
];

export const ROLE_MAP: Record<string, string> = {
	mayor: 'mayor',
	deacon: 'deacon',
	witness: 'witness',
	refinery: 'refinery',
	dog: 'dog',
};

export const EMOJI_ROLE_MAP: Record<string, string> = {
	'🎩': 'mayor',
	'🐺': 'deacon',
	'👷': 'polecat',
	'🐱': 'polecat',
};

export const DEFAULT_CLI_TIMEOUT = 30_000;
export const DEFAULT_REFRESH_INTERVAL = 5000;
export const DEFAULT_HEARTBEAT_STALE_MINUTES = 10;
