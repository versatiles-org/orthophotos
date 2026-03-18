import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../lib/command.ts';
import type { RegionMetadata, StepContext, VrtEntryConfig } from '../lib/framework.ts';

export function assembleVrtArgs(config: VrtEntryConfig, vrtPath: string, fileListPath: string): string[] {
	const args: string[] = [];

	if (config.bands) {
		for (const b of config.bands) {
			args.push('-b', String(b));
		}
	}

	if (config.srcnodata) {
		args.push('-srcnodata', config.srcnodata);
	}

	if (config.addalpha !== false) {
		args.push('-addalpha');
	}

	if (config.allowProjectionDifference) {
		args.push('-allow_projection_difference');
	}

	if (config.srs) {
		args.push('-a_srs', config.srs);
	}

	args.push(vrtPath, '-input_file_list', fileListPath);

	return args;
}

export async function buildVrt(ctx: StepContext, metadata: RegionMetadata): Promise<void> {
	const vrt = metadata.vrt!;

	if (vrt.custom) {
		await vrt.custom(ctx);
		return;
	}

	for (const entry of metadata.entries) {
		const config: VrtEntryConfig = { ...vrt.defaults, ...vrt.entries?.[entry] };
		const ext = config.ext ?? 'jp2';
		const vrtPath = join(ctx.dataDir, `${entry}.vrt`);

		const entryDir = join(ctx.dataDir, entry);
		const files = (await readdir(entryDir, { recursive: config.useFileList ?? false }))
			.filter((f) => f.endsWith(`.${ext}`))
			.sort();
		const fileListPath = join(ctx.tempDir, `${entry.replace(/\//g, '_')}_files.txt`);
		await writeFile(fileListPath, files.map((f) => join(entry, f)).join('\n'));

		const args = assembleVrtArgs(config, vrtPath, fileListPath);
		await runCommand('gdalbuildvrt', args, { cwd: ctx.dataDir });

		if (vrt.postProcess) {
			await vrt.postProcess(ctx, entry, vrtPath);
		}
	}
}
