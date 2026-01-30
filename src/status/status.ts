import { parseYamlFile } from '../lib/yaml.ts';
import type { Feature } from 'geojson';

export type Status = StatusSuccess | StatusError;

export interface License {
	name: string;
	url: string;
	requiresAttribution: boolean;
}

export interface Creator {
	name: string;
	url: string;
}

export interface Entry {
	name: string;
	versaTilesExists: boolean;
	geoJSON?: Feature;
}

export interface StatusSuccess {
	status: 'success';
	rating: number;
	notes: string[];
	entries: Entry[];
	license: License;
	creator: Creator;
}

export interface StatusError {
	status: 'error';
	notes: string[];
}

export function readStatus(filename: string): Status {
	const status = parseYamlFile<Status>(filename);

	if (status.status === 'success') {
		return checkStatusSuccess(status);
	}

	if (status.status === 'error') {
		return checkStatusError(status);
	}

	return status;
}

function cleanupKeys<T>(obj: T, allowedKeys: (keyof T)[]): T {
	return Object.fromEntries(
		allowedKeys.map((key) => [key, obj[key]]).filter(([_, value]) => value !== undefined),
	);
}

function checkUrl(url: string): void {
	if (typeof url !== 'string' || !url.startsWith('http')) {
		throw new Error(`Invalid URL: ${url}`);
	}
}

function checkEntry(entry: Entry): Entry {
	if (typeof entry !== 'object') throw new Error(`Entry must be an object`);
	entry = cleanupKeys(entry, ['name', 'versaTilesExists', 'geoJSON']);

	if (typeof entry.name !== 'string') throw new Error(`Invalid entry name: ${entry.name}`);
	if (typeof entry.versaTilesExists !== 'boolean') {
		throw new Error(`Invalid entry versaTilesExists: ${entry.versaTilesExists}`);
	}

	return entry;
}

function checkLicense(license: License | string | undefined): License {
	const KNOWN_LICENSES: License[] = [
		{
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		{
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		{
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		{
			name: 'DL-DE->Zero-2.0',
			url: 'https://www.govdata.de/dl-de/zero-2-0',
			requiresAttribution: false,
		},
	];

	if (typeof license === 'string') {
		const foundLicense = KNOWN_LICENSES.find((l) => l.name === license);
		if (!foundLicense) throw new Error(`Unknown license: ${license}`);
		license = foundLicense;
	}

	if (typeof license !== 'object') throw new Error(`License must be an object`);
	license = cleanupKeys(license, ['name', 'url', 'requiresAttribution']);

	if (typeof license.name !== 'string') {
		throw new Error(`Invalid license name: ${license.name}`);
	}

	if (typeof license.requiresAttribution !== 'boolean') {
		throw new Error(`Invalid license requiresAttribution: ${license.requiresAttribution}`);
	}

	try {
		checkUrl(license.url);
	} catch (cause) {
		throw new Error(`Invalid license URL`, { cause });
	}

	return license;
}

function checkCreator(creator: Creator): Creator {
	if (typeof creator !== 'object') throw new Error(`Creator must be an object`);
	creator = cleanupKeys(creator, ['name', 'url']);

	if (typeof creator.name !== 'string') throw new Error(`Invalid creator name: ${creator.name}`);
	try {
		checkUrl(creator.url);
	} catch (cause) {
		throw new Error(`Invalid creator URL`, { cause });
	}

	return creator;
}

function checkStatusSuccess(status: StatusSuccess): StatusSuccess {
	if (typeof status !== 'object') {
		throw new Error(`Status must be an object`);
	}
	status = cleanupKeys(status, ['status', 'rating', 'notes', 'entries', 'license', 'creator']);

	if (typeof status.rating !== 'number' || status.rating < 0 || status.rating > 5) {
		throw new Error(`Invalid rating: ${status.rating}`);
	}

	if (!Array.isArray(status.notes) || !status.notes.every((n) => typeof n === 'string')) {
		throw new Error(`Invalid notes: ${status.notes}`);
	}

	if (!Array.isArray(status.entries)) {
		throw new Error(`Entries must be an array`);
	}

	status.entries = status.entries.map((name) => {
		if (typeof name !== 'string') {
			throw new Error(`Entry must be a string: ${name}`);
		}
		const entry: Entry = {
			name,
			versaTilesExists: false,
		};
		return checkEntry(entry);
	});

	status.license = checkLicense(status.license);
	status.creator = checkCreator(status.creator);

	return status;
}

function checkStatusError(status: StatusError): StatusError {
	if (typeof status !== 'object') {
		throw new Error(`Status must be an object`);
	}
	status = cleanupKeys(status, ['status', 'notes']);

	if (!Array.isArray(status.notes) || !status.notes.every((n) => typeof n === 'string')) {
		throw new Error(`Invalid notes: ${status.notes}`);
	}
	return status;
}
