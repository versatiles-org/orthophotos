import { assertEquals, assertThrows } from '@std/assert';
import { parseYamlFile, readStatusEntries } from './yaml.ts';
import { resolve } from '@std/path';

const TEST_DATA_DIR = resolve(import.meta.dirname!, '../../test-data/yaml');

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

Deno.test('parseYamlFile - parses valid YAML file', () => {
	const result = parseYamlFile<SimpleYaml>(resolve(TEST_DATA_DIR, 'simple.yml'));
	assertEquals(result.name, 'test');
	assertEquals(result.value, 42);
});

Deno.test('parseYamlFile - handles nested objects and arrays', () => {
	const result = parseYamlFile<NestedYaml>(resolve(TEST_DATA_DIR, 'nested.yml'));
	assertEquals(result.config.database.host, 'localhost');
	assertEquals(result.config.database.port, 5432);
	assertEquals(result.config.cache.enabled, true);
	assertEquals(result.items.length, 3);
	assertEquals(result.items[0], 'first');
	assertEquals(result.items[1], 'second');
	assertEquals(result.items[2], 'third');
});

Deno.test('parseYamlFile - throws on missing file', () => {
	assertThrows(
		() => parseYamlFile('/nonexistent/path/file.yml'),
		Deno.errors.NotFound,
	);
});

Deno.test('readStatusEntries - extracts entry names', () => {
	const entries = readStatusEntries(resolve(TEST_DATA_DIR, 'status-with-entries.yml'));
	assertEquals(entries.length, 3);
	assertEquals(entries[0], 'entry1');
	assertEquals(entries[1], 'entry2');
	assertEquals(entries[2], 'entry3');
});

Deno.test('readStatusEntries - returns empty array when no entries', () => {
	const entries = readStatusEntries(resolve(TEST_DATA_DIR, 'status-no-entries.yml'));
	assertEquals(entries.length, 0);
});

Deno.test('readStatusEntries - filters non-string entries', () => {
	const entries = readStatusEntries(resolve(TEST_DATA_DIR, 'status-mixed-entries.yml'));
	// Only string entries should be returned
	assertEquals(entries.length, 2);
	assertEquals(entries[0], 'valid_entry');
	assertEquals(entries[1], 'another_entry');
});
