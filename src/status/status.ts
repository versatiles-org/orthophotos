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
