/**
 * Runs the quality-zones step plan from `steps.ts`.
 *
 * Steps are resumable: a step whose output exists is skipped, and every step writes
 * to a `.tmp.` file that is only renamed on success. Delete a step's output to rerun it.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createProgress, runCommand } from '../lib/index.ts';
import { createProgressParser, stripProgress } from './progress.ts';
import { getExportConfig, getPaths, getSteps, getWorldGeoJSON, tmpPath, type Step } from './steps.ts';

export async function buildQualityZones(input: string, output: string, tempDir: string): Promise<void> {
	if (!existsSync(input)) throw new Error(`Input file not found: ${input}`);
	mkdirSync(tempDir, { recursive: true });

	const paths = getPaths(input, tempDir);
	writeFileSync(paths.exportConfig, getExportConfig());
	writeFileSync(paths.world, getWorldGeoJSON());

	const steps = getSteps(paths);
	for (const [index, step] of steps.entries()) {
		const prefix = `[${index + 1}/${steps.length}] ${step.name}`;
		if (existsSync(step.output)) {
			console.log(`${prefix}: skipped, ${step.output} exists`);
			continue;
		}
		const tmp = tmpPath(step.output);
		rmSync(tmp, { force: true });

		console.log(prefix);
		const start = Date.now();
		await runStep(step);
		if (!existsSync(tmp)) throw new Error(`Step "${step.name}" did not write ${tmp}`);
		renameSync(tmp, step.output);
		for (const file of step.cleanup ?? []) rmSync(file, { force: true });
		console.log(`  took ${formatSeconds((Date.now() - start) / 1000)}`);
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

/**
 * Runs a step with a progress bar fed by the tool's own progress output.
 * The tool's output is captured, not shown, and is included in the error if the step fails.
 */
async function runStep(step: Step): Promise<void> {
	const parse = createProgressParser(step.cmd);
	const progress = createProgress(100, { labels: ['%'], logInterval: 10 });
	let shown = 0;
	const advanceTo = (percent: number): void => {
		const target = Math.floor(percent);
		if (target > shown) progress.tick('%', target - shown);
		shown = Math.max(shown, target);
	};
	const result = await runCommand(step.cmd, step.args, {
		quiet: true,
		onOutput: (stream, chunk) => {
			const percent = parse?.(stream, chunk);
			if (percent !== undefined) advanceTo(percent);
		},
	});
	advanceTo(100);
	progress.done();
	// Warnings don't fail a step, but can mean a broken result, so show them.
	for (const line of stripProgress(new TextDecoder().decode(result.stderr))) console.warn(`  ${line}`);
}

function formatSeconds(seconds: number): string {
	if (seconds < 60) return `${seconds.toFixed(0)} s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${(seconds % 60).toFixed(0)} s`;
	return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
}

function countFeatures(geojsonPath: string): number {
	const data = JSON.parse(readFileSync(geojsonPath, 'utf8')) as { features?: unknown[] };
	return data.features?.length ?? 0;
}
