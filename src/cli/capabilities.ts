/*---------------------------------------------------------------------------------------------
 *  VSMax - Citadel Terminal IDE
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { ProcessSupervisor } from './processSupervisor';
import type { CapabilitiesResult } from './contracts';

export const MIN_GT_VERSION = '0.3.0';
export const MIN_BD_VERSION = '0.47.0';

const CACHE_TTL = 60_000;

let cachedCapabilities: CapabilitiesResult | null = null;
let cacheTime = 0;

function parseVersion(output: string): string | null {
	const match = String(output).match(/(\d+\.\d+\.\d+)/);
	return match ? match[1] : null;
}

function compareVersions(a: string, b: string): number {
	const aParts = a.split('.').map(Number);
	const bParts = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const diff = (aParts[i] || 0) - (bParts[i] || 0);
		if (diff !== 0) { return diff; }
	}
	return 0;
}

export async function probeCapabilities(
	supervisor: ProcessSupervisor,
	forceRefresh = false,
): Promise<CapabilitiesResult> {
	const now = Date.now();
	if (!forceRefresh && cachedCapabilities && now - cacheTime < CACHE_TTL) {
		return cachedCapabilities;
	}

	const [gtResult, bdResult] = await Promise.all([
		supervisor.gt<string>(['--version'], { timeout: 5000, dedupe: true }),
		supervisor.bd<string>(['--version'], { timeout: 5000, dedupe: true }),
	]);

	const gtVersion = gtResult.success ? parseVersion(String(gtResult.data)) : null;
	const bdVersion = bdResult.success ? parseVersion(String(bdResult.data)) : null;
	const available = gtResult.success || bdResult.success;

	const features = {
		jsonOutput: true,
		mail: gtVersion !== null,
		work: bdVersion !== null,
		convoys: bdVersion !== null,
	};

	const error = !available
		? 'CLI tools are not available: ' + [gtResult.error, bdResult.error].filter(Boolean).join('; ')
		: null;

	cachedCapabilities = { gtVersion, bdVersion, features, available, error };
	cacheTime = now;
	return cachedCapabilities;
}

export function clearCapabilitiesCache(): void {
	cachedCapabilities = null;
	cacheTime = 0;
}

export interface VersionCompatibility {
	compatible: boolean;
	gtCompatible: boolean;
	bdCompatible: boolean;
}

export function checkVersionCompatibility(
	gtVersion: string | null,
	bdVersion: string | null,
): VersionCompatibility {
	const gtCompatible = gtVersion !== null && compareVersions(gtVersion, MIN_GT_VERSION) >= 0;
	const bdCompatible = bdVersion !== null && compareVersions(bdVersion, MIN_BD_VERSION) >= 0;
	return { compatible: gtCompatible && bdCompatible, gtCompatible, bdCompatible };
}
