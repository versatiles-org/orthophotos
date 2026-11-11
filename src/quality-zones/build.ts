/**
 * Runs the quality-zones step plan from `steps.ts`.
 *
 * Steps are resumable: a step whose output exists is skipped, and every step writes
 * to a `.tmp.` file that is only renamed on success. Delete a step's output to rerun it.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { runCommand } from '../lib/index.ts';
import { getExportConfig, getPaths, getSteps, getWorldGeoJSON, tmpPath } from './steps.ts';

export async function buildQualityZones(input: string, output: string, tempDir: string): Promise<void> {
	if (!existsSync(input)) throw new Error(`Input file not found: ${input}`);
	mkdirSync(tempDir, { recursive: true });

	const paths = getPaths(input, tempDir);
	writeFileSync(paths.exportConfig, getExportConfig());
	writeFileSync(paths.world, getWorldGeoJSON());

	for (const step of getSteps(paths)) {
		if (existsSync(step.output)) {
			console.log(`skip ${step.name}: ${step.output} exists`);
			continue;
		}
		const tmp = tmpPath(step.output);
		rmSync(tmp, { force: true });

		console.log(`${step.name}…`);
		const start = Date.now();
		await runCommand(step.cmd, step.args);
		if (!existsSync(tmp)) throw new Error(`Step "${step.name}" did not write ${tmp}`);
		renameSync(tmp, step.output);
		for (const file of step.cleanup ?? []) rmSync(file, { force: true });
		console.log(`${step.name} done in ${((Date.now() - start) / 1000).toFixed(0)} s`);
	}

	const invalid = countFeatures(paths.geometryErrors);
	if (invalid > 0) {
		throw new Error(`Geometry check found ${invalid} invalid geometries, see ${paths.geometryErrors}`);
	}
	const gaps = countFeatures(paths.coverageErrors);
	if (gaps > 0) {
		throw new Error(`Coverage check found ${gaps} gaps or overlaps, see ${paths.coverageErrors}`);
	}

	copyFileSync(paths.result, output);
	console.log(`Wrote ${output}`);
}

function countFeatures(geojsonPath: string): number {
	const data = JSON.parse(readFileSync(geojsonPath, 'utf8')) as { features?: unknown[] };
	return data.features?.length ?? 0;
}
