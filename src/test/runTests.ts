/*---------------------------------------------------------------------------------------------
 *  Integration test launcher for @vscode/test-electron.
 *
 *  Downloads a copy of VS Code, loads the extension under development,
 *  and runs the Mocha-based integration tests inside the extension host.
 *
 *  Usage: node out/test/runTests.js
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
	// The root of the extension (contains package.json)
	const extensionDevelopmentPath = path.resolve(__dirname, '../../');

	// The mocha runner entry point (compiled from src/test/integration/index.ts)
	const extensionTestsPath = path.resolve(__dirname, './integration/index');

	// Minimal test workspace with settings that disable auto-refresh
	const testWorkspace = path.resolve(__dirname, '../../src/test/fixtures');

	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [
			testWorkspace,
			'--disable-extensions',  // Disable marketplace extensions (ours is still loaded)
			'--disable-gpu',
		],
	});
}

main().catch(err => {
	console.error('Failed to run integration tests:', err);
	process.exit(1);
});
