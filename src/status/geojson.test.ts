import { assertEquals, assertThrows } from '@std/assert';
import { reducePrecision } from './geojson.ts';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Point, Polygon } from 'geojson';

Deno.test('reducePrecision - rounds Point coordinates to 6 decimals', () => {
	const point: Point = {
		type: 'Point',
		coordinates: [9.123456789, 47.987654321],
	};
	reducePrecision(point);
	assertEquals(point.coordinates[0], 9.123457);
	assertEquals(point.coordinates[1], 47.987654);
});

Deno.test('reducePrecision - handles Polygon geometry', () => {
	const polygon: Polygon = {
		type: 'Polygon',
		coordinates: [
			[
				[9.123456789, 47.987654321],
				[15.111111111, 47.222222222],
				[15.333333333, 55.444444444],
				[9.555555555, 55.666666666],
				[9.123456789, 47.987654321],
			],
		],
	};
	reducePrecision(polygon);

	assertEquals(polygon.coordinates[0][0][0], 9.123457);
	assertEquals(polygon.coordinates[0][0][1], 47.987654);
	assertEquals(polygon.coordinates[0][1][0], 15.111111);
	assertEquals(polygon.coordinates[0][1][1], 47.222222);
});

Deno.test('reducePrecision - handles MultiPolygon geometry', () => {
	const multiPolygon: MultiPolygon = {
		type: 'MultiPolygon',
		coordinates: [
			[
				[
					[1.1234567, 2.7654321],
					[3.1111111, 4.2222222],
					[5.3333333, 6.4444444],
					[1.1234567, 2.7654321],
				],
			],
			[
				[
					[10.9876543, 20.1234567],
					[30.1111111, 40.2222222],
					[50.3333333, 60.4444444],
					[10.9876543, 20.1234567],
				],
			],
		],
	};
	reducePrecision(multiPolygon);

	assertEquals(multiPolygon.coordinates[0][0][0][0], 1.123457);
	assertEquals(multiPolygon.coordinates[1][0][0][0], 10.987654);
});

Deno.test('reducePrecision - processes Feature geometry', () => {
	const feature: Feature = {
		type: 'Feature',
		properties: { name: 'test' },
		geometry: {
			type: 'Point',
			coordinates: [9.123456789, 47.987654321],
		},
	};
	reducePrecision(feature);

	const point = feature.geometry as Point;
	assertEquals(point.coordinates[0], 9.123457);
	assertEquals(point.coordinates[1], 47.987654);
});

Deno.test('reducePrecision - processes FeatureCollection', () => {
	const featureCollection: FeatureCollection = {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				properties: { name: 'first' },
				geometry: {
					type: 'Point',
					coordinates: [1.111111111, 2.222222222],
				},
			},
			{
				type: 'Feature',
				properties: { name: 'second' },
				geometry: {
					type: 'Point',
					coordinates: [3.333333333, 4.444444444],
				},
			},
		],
	};
	reducePrecision(featureCollection);

	const firstPoint = featureCollection.features[0].geometry as Point;
	const secondPoint = featureCollection.features[1].geometry as Point;

	assertEquals(firstPoint.coordinates[0], 1.111111);
	assertEquals(secondPoint.coordinates[0], 3.333333);
});

Deno.test('reducePrecision - throws on unknown geometry type', () => {
	const invalid = {
		type: 'UnknownType',
		coordinates: [1, 2],
	} as unknown as Geometry;

	assertThrows(
		() => reducePrecision(invalid),
		Error,
		'Unknown geometry type',
	);
});

Deno.test('reducePrecision - handles LineString geometry', () => {
	const lineString: Geometry = {
		type: 'LineString',
		coordinates: [
			[1.1234567, 2.7654321],
			[3.9876543, 4.1234567],
		],
	};
	reducePrecision(lineString);

	if (lineString.type === 'LineString') {
		assertEquals(lineString.coordinates[0][0], 1.123457);
		assertEquals(lineString.coordinates[1][0], 3.987654);
	}
});

Deno.test('reducePrecision - handles MultiPoint geometry', () => {
	const multiPoint: Geometry = {
		type: 'MultiPoint',
		coordinates: [
			[1.1234567, 2.7654321],
			[3.9876543, 4.1234567],
		],
	};
	reducePrecision(multiPoint);

	if (multiPoint.type === 'MultiPoint') {
		assertEquals(multiPoint.coordinates[0][0], 1.123457);
		assertEquals(multiPoint.coordinates[1][0], 3.987654);
	}
});

Deno.test('reducePrecision - handles MultiLineString geometry', () => {
	const multiLineString: Geometry = {
		type: 'MultiLineString',
		coordinates: [
			[
				[1.1234567, 2.7654321],
				[3.9876543, 4.1234567],
			],
			[
				[5.1234567, 6.7654321],
				[7.9876543, 8.1234567],
			],
		],
	};
	reducePrecision(multiLineString);

	if (multiLineString.type === 'MultiLineString') {
		assertEquals(multiLineString.coordinates[0][0][0], 1.123457);
		assertEquals(multiLineString.coordinates[1][0][0], 5.123457);
	}
});

Deno.test('reducePrecision - handles GeometryCollection', () => {
	const geometryCollection: Geometry = {
		type: 'GeometryCollection',
		geometries: [
			{
				type: 'Point',
				coordinates: [1.1234567, 2.7654321],
			},
			{
				type: 'Point',
				coordinates: [3.9876543, 4.1234567],
			},
		],
	};
	reducePrecision(geometryCollection);

	if (geometryCollection.type === 'GeometryCollection') {
		const first = geometryCollection.geometries[0] as Point;
		const second = geometryCollection.geometries[1] as Point;
		assertEquals(first.coordinates[0], 1.123457);
		assertEquals(second.coordinates[0], 3.987654);
	}
});

Deno.test('reducePrecision - preserves exact 6 decimal precision', () => {
	const point: Point = {
		type: 'Point',
		coordinates: [9.123456, 47.987654],
	};
	reducePrecision(point);
	// Should remain unchanged
	assertEquals(point.coordinates[0], 9.123456);
	assertEquals(point.coordinates[1], 47.987654);
});
