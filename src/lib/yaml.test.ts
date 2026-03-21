import { expect, test } from 'vitest';
import { parseYamlFile } from './yaml.ts';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = resolve(__dirname, '../../test-data/yaml');

interface SimpleYaml {
	name: string;
	value: number;
}

interface NestedYaml {
	config: {
		database: {
			host: string;
			port: number;
		};
		cache: {
			enabled: boolean;
		};
	};
	items: string[];
}

test('parseYamlFile - parses valid YAML file', () => {
	const result = parseYamlFile<SimpleYaml>(resolve(TEST_DATA_DIR, 'simple.yml'));
	expect(result.name).toBe('test');
	expect(result.value).toBe(42);
});

test('parseYamlFile - handles nested objects and arrays', () => {
	const result = parseYamlFile<NestedYaml>(resolve(TEST_DATA_DIR, 'nested.yml'));
	expect(result.config.database.host).toBe('localhost');
	expect(result.config.database.port).toBe(5432);
	expect(result.config.cache.enabled).toBe(true);
	expect(result.items.length).toBe(3);
	expect(result.items[0]).toBe('first');
	expect(result.items[1]).toBe('second');
	expect(result.items[2]).toBe('third');
});

test('parseYamlFile - throws on missing file', () => {
	expect(() => parseYamlFile('/nonexistent/path/file.yml')).toThrow();
});
