/**
 * Registry mapping region IDs to their pipeline definitions.
 */

import type { RegionMetadata, RegionPipeline } from '../lib/framework.ts';

import al from './al.ts';
import at from './at.ts';
import be from './be.ts';
import bg from './bg.ts';
import ch from './ch.ts';
import cz from './cz.ts';
import * as de from './de.ts';
import dk from './dk.ts';
import ee from './ee.ts';
import el from './el.ts';
import fi from './fi.ts';
import fr from './fr.ts';
import ie from './ie.ts';
import li from './li.ts';
import lt from './lt.ts';
import lv from './lv.ts';
import nl from './nl.ts';
import no from './no.ts';
import pl from './pl.ts';
import ro from './ro.ts';
import se from './se.ts';
import sk from './sk.ts';

const pipelines: RegionPipeline[] = [
	al,
	at,
	be,
	bg,
	ch,
	cz,
	...Object.values(de),
	dk,
	ee,
	el,
	fi,
	fr,
	ie,
	li,
	lt,
	lv,
	nl,
	no,
	pl,
	ro,
	se,
	sk,
];

const registry = new Map<string, RegionPipeline>();
for (const p of pipelines) {
	registry.set(p.id, p);
}

/**
 * Returns the pipeline for a region, or undefined if no definition exists.
 */
export function getRegionPipeline(regionId: string): RegionPipeline | undefined {
	return registry.get(regionId);
}

/**
 * Returns the metadata for a region, or undefined if no definition exists.
 */
export function getRegionMetadata(regionId: string): RegionMetadata | undefined {
	return registry.get(regionId)?.metadata;
}

/**
 * Returns all registered region IDs and their metadata.
 */
export function getAllRegionMetadata(): Map<string, RegionMetadata> {
	const map = new Map<string, RegionMetadata>();
	for (const [id, pipeline] of registry) {
		map.set(id, pipeline.metadata);
	}
	return map;
}
