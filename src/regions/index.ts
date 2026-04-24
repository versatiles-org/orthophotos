/**
 * Registry mapping region IDs to their pipeline definitions.
 */

import type { RegionMetadata, RegionPipeline, RegionStatus } from '../lib/framework.ts';

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
import fr from './fr.ts';
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
	...fr,
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
 * Returns region metadata with `aggregateUnder` children collapsed into their
 * declared parent. Children disappear from the map; the parent entry summarizes
 * status, date range, releaseDate, and notes. Intended for status display; the
 * pipeline runner and VPL generator should keep using `getAllRegionMetadata()`.
 */
export function getAggregatedRegionMetadata(): Map<string, RegionMetadata> {
	return applyAggregation(getAllRegionMetadata());
}

/**
 * Pure version of `getAggregatedRegionMetadata()` — exported for testing.
 * Collapses entries with `aggregateUnder: P` into a single entry with ID `P`.
 */
export function applyAggregation(raw: Map<string, RegionMetadata>): Map<string, RegionMetadata> {
	const result = new Map<string, RegionMetadata>();
	const groups = new Map<string, RegionMetadata[]>();

	for (const [id, meta] of raw) {
		if (meta.aggregateUnder) {
			const list = groups.get(meta.aggregateUnder) ?? [];
			list.push(meta);
			groups.set(meta.aggregateUnder, list);
		} else {
			result.set(id, meta);
		}
	}

	for (const [parentId, children] of groups) {
		if (result.has(parentId)) {
			throw new Error(`Cannot aggregate children under '${parentId}': a region with that ID is already registered.`);
		}
		result.set(parentId, aggregateMetadata(children));
	}

	return result;
}

function aggregateMetadata(children: RegionMetadata[]): RegionMetadata {
	if (children.length === 0) throw new Error('aggregateMetadata: empty children list');
	const first = children[0];

	// Status rollup: when all children share a status, use it; otherwise 'scraping'
	// (partial progress). We intentionally don't try to encode "mixed" — the enum
	// has no such value and the UI only needs a single indicator.
	const statuses = new Set(children.map((c) => c.status));
	const status: RegionStatus = statuses.size === 1 ? [...statuses][0]! : 'scraping';

	// date: min-year of all children's min, max-year of all children's max.
	const ranges = children.flatMap((c) => (c.date ? [parseYearRange(c.date)] : []));
	let date: string | undefined;
	if (ranges.length > 0) {
		const min = ranges.reduce((a, b) => (a.min < b.min ? a : b)).min;
		const max = ranges.reduce((a, b) => (a.max > b.max ? a : b)).max;
		date = min === max ? min : `${min}-${max}`;
	}

	// releaseDate: latest (string compare works on YYYY-MM-DD).
	const releaseDates = children.map((c) => c.releaseDate).filter((d): d is string => typeof d === 'string');
	const releaseDate = releaseDates.length > 0 ? releaseDates.reduce((a, b) => (a > b ? a : b)) : undefined;

	// notes: deduped union preserving first-seen order.
	const seen = new Set<string>();
	const notes: string[] = [];
	for (const c of children) {
		for (const n of c.notes) {
			if (!seen.has(n)) {
				seen.add(n);
				notes.push(n);
			}
		}
	}

	// license / creator / entries / mask / maskBuffer copied from first child —
	// siblings under the same parent are expected to share these.
	const base = {
		notes,
		entries: first.entries,
		license: first.license,
		creator: first.creator,
		date,
		mask: first.mask,
		maskBuffer: first.maskBuffer,
	};

	if (status === 'released') {
		if (!releaseDate) throw new Error('aggregateMetadata: released status requires releaseDate');
		return { ...base, status: 'released', releaseDate };
	}
	return { ...base, status, releaseDate };
}

function parseYearRange(s: string): { min: string; max: string } {
	const m = /^(\d{4})-(\d{4})$/.exec(s);
	if (m) return { min: m[1], max: m[2] };
	const y = s.slice(0, 4);
	return { min: y, max: y };
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
		const containsBoost = idLower.includes(lower) ? -100 : 0;
		scored.push({ id, score: d + containsBoost });
	}
	scored.sort((a, b) => a.score - b.score);
	return scored.slice(0, limit).map((s) => s.id);
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
