/**
 * YAML parsing utilities for reading status.yml files.
 * Uses @std/yaml to replace the yq CLI dependency.
 */

import { parse } from '@std/yaml';

interface StatusYaml {
	status: string;
	entries?: string[];
}

/**
 * Reads a status.yml file and returns the list of entry names.
 */
export function readStatusEntries(statusPath: string): string[] {
	const text = Deno.readTextFileSync(statusPath);
	const yaml = parse(text) as StatusYaml;

	if (!yaml.entries || !Array.isArray(yaml.entries)) {
		return [];
	}

	return yaml.entries.filter((entry): entry is string => typeof entry === 'string');
}
