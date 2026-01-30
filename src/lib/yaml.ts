/**
 * Unified YAML parsing utilities.
 */

import { parse } from '@std/yaml';

export { parse };

/**
 * Parses a YAML file and returns the typed result.
 * @param path Path to the YAML file
 * @returns Parsed YAML content
 */
export function parseYamlFile<T>(path: string): T {
	const text = Deno.readTextFileSync(path);
	return parse(text) as T;
}

interface StatusYaml {
	status: string;
	entries?: string[];
}

/**
 * Reads a status.yml file and returns the list of entry names.
 * Used by the run script task pipeline.
 * @param statusPath Path to the status.yml file
 * @returns Array of entry names
 */
export function readStatusEntries(statusPath: string): string[] {
	const yaml = parseYamlFile<StatusYaml>(statusPath);

	if (!yaml.entries || !Array.isArray(yaml.entries)) {
		return [];
	}

	return yaml.entries.filter((entry): entry is string => typeof entry === 'string');
}
