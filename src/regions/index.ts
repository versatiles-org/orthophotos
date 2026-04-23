/**
 * Registry mapping region IDs to their pipeline definitions.
 */

import type { RegionMetadata, RegionPipeline } from '../lib/framework.ts';

import al from './al.ts';
import at from './at.ts';
import be from './be.ts';
import bg from './bg.ts';
import ch from './ch.ts';
import cy from './cy.ts';
import cz from './cz.ts';
import * as de from './de.ts';
import dk from './dk.ts';
import ee from './ee.ts';
import el from './el.ts';
import es from './es.ts';
import fi from './fi.ts';
import * as fr from './fr.ts';
import hr from './hr.ts';
import hu from './hu.ts';
import ie from './ie.ts';
import it from './it.ts';
import li from './li.ts';
import lt from './lt.ts';
import lu from './lu.ts';
import lv from './lv.ts';
import mt from './mt.ts';
import nl from './nl.ts';
import no from './no.ts';
import pl from './pl.ts';
import pt from './pt.ts';
import ro from './ro.ts';
import se from './se.ts';
import si from './si.ts';
import sk from './sk.ts';

const pipelines: RegionPipeline[] = [
	al,
	at,
	be,
	bg,
	ch,
	cy,
	cz,
	...Object.values(de),
	dk,
	ee,
	el,
	es,
	fi,
	...Object.values(fr),
	hr,
	hu,
	ie,
	it,
	li,
	lt,
	lu,
	lv,
	mt,
	nl,
	no,
	pl,
	pt,
	ro,
	se,
	si,
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

/**
 * Returns up to `limit` registered region IDs that are similar to `name`,
 * ranked by Levenshtein distance. Useful for "did you mean?" error messages.
 * Matches that also contain `name` as a substring (or vice versa) are boosted,
 * so typing `bayern` surfaces `de/bayern`.
 */
export function suggestSimilarRegions(name: string, limit = 5): string[] {
	const lower = name.toLowerCase();
	const scored: { id: string; score: number }[] = [];
	for (const id of registry.keys()) {
		const idLower = id.toLowerCase();
		const d = levenshtein(lower, idLower);
		// Soft boost when either string contains the other — catches missing prefixes
		// (e.g. `bayern` vs `de/bayern`) without drowning out close edit-distance matches.
		const containsBoost = idLower.includes(lower) || lower.includes(idLower) ? -2 : 0;
		scored.push({ id, score: d + containsBoost });
	}
	scored.sort((a, b) => a.score - b.score);
	// Tight threshold so short typos (e.g. "xx") don't surface every 2-letter code.
	const threshold = Math.max(1, Math.floor(name.length / 3));
	return scored
		.filter((s) => s.score <= threshold)
		.slice(0, limit)
		.map((s) => s.id);
}

/** Levenshtein edit distance. O(m*n) time, O(min(m,n)) space. */
export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;
	// Keep `b` as the shorter string so the inner array stays small.
	if (a.length < b.length) [a, b] = [b, a];
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	let cur = new Array<number>(b.length + 1);
	for (let i = 1; i <= a.length; i++) {
		cur[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		[prev, cur] = [cur, prev];
	}
	return prev[b.length];
}
