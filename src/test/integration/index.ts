/*---------------------------------------------------------------------------------------------
 *  Mocha test runner for VS Code integration tests.
 *
 *  This module is loaded by @vscode/test-electron inside the extension host.
 *  It discovers and runs all *.test.js files in this directory.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
	const mocha = new Mocha({
		ui: 'tdd',
		timeout: 60000,
		color: true,
	});

	const testsRoot = __dirname;

	return new Promise((resolve, reject) => {
		const testFiles = fs.readdirSync(testsRoot)
			.filter(f => f.endsWith('.test.js'));

		testFiles.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

		try {
			mocha.run(failures => {
				if (failures > 0) {
					reject(new Error(`${failures} test(s) failed.`));
				} else {
					resolve();
				}
			});
		} catch (err) {
			reject(err);
		}
	});
}
