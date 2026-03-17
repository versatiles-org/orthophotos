/**
 * Step-based framework for wrapping bash script execution with
 * named steps, timing, output capture, and postcondition validation.
 */

import { resolve } from 'node:path';
import { runCommand } from '../lib/command.ts';

export interface StepContext {
	name: string;
	projDir: string;
	dataDir: string;
	tempDir: string;
}

export interface BashStepOptions {
	scriptFile: string;
	cwd?: 'data' | 'temp';
	validate?: (ctx: StepContext) => Promise<void>;
}

export interface Step {
	name: string;
	run: (ctx: StepContext) => Promise<void>;
}

export interface RegionPipeline {
	id: string;
	steps: Step[];
}

/**
 * Creates a step that runs a bash script with optional postcondition validation.
 */
export function bashStep(name: string, options: BashStepOptions): Step {
	return {
		name,
		run: async (ctx: StepContext) => {
			const scriptPath = resolve(ctx.projDir, options.scriptFile);
			const cwd = options.cwd === 'data' ? ctx.dataDir : ctx.tempDir;
			const env = { DATA: ctx.dataDir, TEMP: ctx.tempDir, PROJ: ctx.projDir };

			const result = await runCommand('bash', ['-c', scriptPath], {
				cwd,
				env,
				stdout: 'piped',
				stderr: 'piped',
			});

			const stdout = new TextDecoder().decode(result.stdout);
			const stderr = new TextDecoder().decode(result.stderr);

			if (stdout) process.stdout.write(stdout);
			if (stderr) process.stderr.write(stderr);

			if (options.validate) {
				try {
					await options.validate(ctx);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(
						`Postcondition failed for step "${name}": ${message}` +
							(stderr ? `\n\nCaptured stderr:\n${stderr}` : ''),
					);
				}
			}
		},
	};
}

/**
 * Creates a step from a plain async function.
 */
export function step(name: string, fn: (ctx: StepContext) => Promise<void>): Step {
	return { name, run: fn };
}

/**
 * Defines a region's fetch pipeline as a sequence of steps.
 */
export function defineRegion(id: string, steps: Step[]): RegionPipeline {
	return { id, steps };
}

/**
 * Runs all steps for a region sequentially, with timing and error context.
 */
export async function runPipeline(pipeline: RegionPipeline, ctx: StepContext): Promise<void> {
	console.log(`Running pipeline for ${pipeline.id} (${pipeline.steps.length} steps)`);

	for (const s of pipeline.steps) {
		const start = performance.now();
		console.log(`  [${s.name}] starting...`);

		try {
			await s.run(ctx);
		} catch (err) {
			const elapsed = ((performance.now() - start) / 1000).toFixed(1);
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Step "${s.name}" failed after ${elapsed}s: ${message}`);
		}

		const elapsed = ((performance.now() - start) / 1000).toFixed(1);
		console.log(`  [${s.name}] completed in ${elapsed}s`);
	}
}
