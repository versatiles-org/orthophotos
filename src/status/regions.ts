import { relative, resolve } from '@std/path';
import { existsSync } from '@std/fs';
import { readStatus, Status } from './status.ts';

interface Region {
	id: string;
	status: Status;
}

export function scanRegions(base_directory: string): Region[] {
	const entries: Region[] = [];

	recursive(base_directory);

	function recursive(directory: string) {
		const statusFilename = resolve(directory, 'status.yml');
		if (existsSync(statusFilename)) {
			try {
				const status = readStatus(statusFilename);
				entries.push({ id: relative(base_directory, directory), status });
			} catch (error) {
				console.error(`Error reading ${statusFilename}`);
				throw error;
			}
		} else {
			for (const entry of Deno.readDirSync(directory)) {
				if (entry.isDirectory) {
					recursive(resolve(directory, entry.name));
				}
			}
		}
	}

	return entries;
}
