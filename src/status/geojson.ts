// deno-lint-ignore-file no-explicit-any

import { resolve } from '@std/path/resolve';
import { gunzipSync } from 'node:zlib';
import type { Feature, Polygon, MultiPolygon, Geometry, FeatureCollection } from 'geojson';
import * as topojson from 'topojson-client';
import { string2ascii } from './ascii.ts';

export type ValidRegion = Feature<Polygon | MultiPolygon, Record<string, any>>;
export type KnownRegion = Feature<Polygon | MultiPolygon, { id: string, name: string, fullname: string }>;

export function loadKnownRegions(folder: string): KnownRegion[] {
	const regions: KnownRegion[] = [];
	regions.push(...parseNUTS(loadData(resolve(folder, 'NUTS_RG_03M_2024_4326.topojson.gz'))));

	return regions;
}

function parseNUTS(validRegions: ValidRegion[]): KnownRegion[] {
	const knownIds = new Set<string>();
	const knownCountries = new Map<string, string>();
	const list: KnownRegion[] = [];

	function add(region: ValidRegion, id: string, name: string, fullname: string) {
		id = id.split('#').map(s => string2ascii(s)).join('/');

		const knownRegion: KnownRegion = {
			type: 'Feature',
			geometry: region.geometry,
			properties: { id, name, fullname }
		};
		if (!knownIds.has(id)) {
			knownIds.add(id);
			list.push(knownRegion);
		}
	}

	validRegions.sort((a, b) => (a.properties.LEVL_CODE - b.properties.LEVL_CODE) || (a.properties.NUTS_ID.localeCompare(b.properties.NUTS_ID)));

	// add level 0 regions (countries)
	for (const v of validRegions) {
		const p = v.properties;
		if (p.LEVL_CODE === 0) {
			add(v, p.CNTR_CODE, p.NAME_LATN, p.NAME_LATN);
			knownCountries.set(p.CNTR_CODE, p.NAME_LATN);
		}
	}

	// add other levels
	for (const v of validRegions) {
		const p = v.properties;
		if (p.LEVL_CODE > 0) {
			const countryName = knownCountries.get(p.CNTR_CODE);
			if (!countryName) {
				throw new Error(`Unknown country code: ${p.CNTR_CODE}`);
			}
			add(v, p.CNTR_CODE + '#' + p.NAME_LATN, p.NAME_LATN, countryName + ' - ' + p.NAME_LATN);
		}
	}

	return list;
}

function loadData(filePath: string): ValidRegion[] {
	let buffer: Uint8Array = Deno.readFileSync(filePath);

	const extensions = filePath.split('.').slice(1).reverse();
	if (extensions[0] === 'gz') {
		buffer = gunzipSync(buffer);
		extensions.shift();
	}

	if (extensions.length !== 1) {
		throw new Error(`Unsupported file extension: ${filePath}`);
	}

	let features: Feature[] = [];
	switch (extensions[0]) {
		case 'geojson': features = loadGeoJSON(buffer); break;
		case 'topojson': features = loadTopoJSON(buffer); break;
	}

	for (const feature of features) {
		if (feature.geometry?.type !== 'Polygon' && feature.geometry?.type !== 'MultiPolygon') {
			throw new Error('Invalid geometry type, expected Polygon or MultiPolygon');
		}
		if (!feature.properties) feature.properties = {};
	}

	return features as ValidRegion[];
}

function extractFeatures(geojson: any): Feature[] {
	if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
		throw new Error('Invalid GeoJSON format');
	}
	reducePrecision(geojson);
	return geojson.features;
}

function loadGeoJSON(buffer: Uint8Array): Feature[] {
	return extractFeatures(JSON.parse(new TextDecoder().decode(buffer)));
}

function loadTopoJSON(buffer: Uint8Array): Feature[] {
	const topojsonData = JSON.parse(new TextDecoder().decode(buffer));
	if (!topojsonData.objects || typeof topojsonData.objects !== 'object') {
		throw new Error('Invalid TopoJSON format');
	}
	const objectKey = Object.keys(topojsonData.objects)[0];
	const geojson = topojson.feature(topojsonData, topojsonData.objects[objectKey]);
	return extractFeatures(geojson);
}

export function reducePrecision(geometry: Geometry | Feature | FeatureCollection) {
	function roundCoord1(coord: GeoJSON.Position) {
		coord[0] = Math.round(coord[0] * 1e6) / 1e6;
		coord[1] = Math.round(coord[1] * 1e6) / 1e6;
	}
	function roundCoord2(coords: GeoJSON.Position[]) {
		for (const coord of coords) roundCoord1(coord);
	}
	function roundCoord3(coords: GeoJSON.Position[][]) {
		for (const ring of coords) roundCoord2(ring);
	}
	function roundCoord4(coords: GeoJSON.Position[][][]) {
		for (const polygon of coords) roundCoord3(polygon);
	}
	const type = geometry.type;
	switch (type) {
		case 'Point': return roundCoord1(geometry.coordinates);
		case 'MultiPoint': return roundCoord2(geometry.coordinates);
		case 'LineString': return roundCoord2(geometry.coordinates);
		case 'MultiLineString': return roundCoord3(geometry.coordinates);
		case 'Polygon': return roundCoord3(geometry.coordinates);
		case 'MultiPolygon': return roundCoord4(geometry.coordinates);
		case 'Feature': return reducePrecision(geometry.geometry);
		case 'FeatureCollection':
			for (const feature of geometry.features) reducePrecision(feature);
			return;
		case 'GeometryCollection':
			for (const geom of geometry.geometries) reducePrecision(geom);
			return;
		default: throw new Error(`Unknown geometry type: ${type}`);
	}
}