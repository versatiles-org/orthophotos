/**
 * Unified YAML parsing utilities.
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export { parse };

/**
 * Parses a YAML file and returns the typed result.
 * @param path Path to the YAML file
 * @returns Parsed YAML content
 */
export function parseYamlFile<T>(path: string): T {
	const text = readFileSync(path, 'utf-8');
	return parse(text) as T;
}
