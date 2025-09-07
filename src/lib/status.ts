import { parse } from '@std/yaml';

export type Status = StatusSuccess | StatusError;

export interface StatusSuccess {
	status: 'success';
	rating: number;
	notes: string[];
	data: string[];
	license: string;
	creator: string;
	url: string;
}

export interface StatusError {
	status: 'error';
	notes: string[];
}

export function readStatus(filename: string): Status {
	const text = Deno.readTextFileSync(filename);
	const status = parse(text) as Status;
	if (!['success', 'error'].includes(status.status)) {
		throw new Error(`Invalid status: ${status.status}`);
	}

	if (!Array.isArray(status.notes) || !status.notes.every(n => typeof n === 'string')) {
		throw new Error(`Invalid notes: ${status.notes}`);
	}

	if (status.status === 'error') return status;

	if (typeof status.rating !== 'number' || status.rating < 0 || status.rating > 5) {
		throw new Error(`Invalid rating: ${status.rating}`);
	}

	if (!Array.isArray(status.data) || !status.data.every(n => typeof n === 'string')) {
		throw new Error(`Invalid data: ${status.data}`);
	}

	if (typeof status.license !== 'string') {
		throw new Error(`Invalid license: ${status.license}`);
	}

	if (typeof status.creator !== 'string') {
		throw new Error(`Invalid creator: ${status.creator}`);
	}

	if (typeof status.url !== 'string') {
		throw new Error(`Invalid url: ${status.url}`);
	}

	return status;
}