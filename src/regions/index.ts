/**
 * Registry mapping region IDs to their pipeline definitions.
 * Regions without a definition here fall back to the existing runBashScript path.
 */

import type { RegionMetadata, RegionPipeline } from '../lib/framework.ts';
import deThueringen from './de_thueringen.ts';

const pipelines: RegionPipeline[] = [deThueringen];

const registry = new Map<string, RegionPipeline>();
for (const p of pipelines) {
	registry.set(p.id, p);
}

/**
 * Returns the pipeline for a region, or undefined if no framework definition exists.
 */
export function getRegionPipeline(regionId: string): RegionPipeline | undefined {
	return registry.get(regionId);
}

/**
 * Returns the metadata for a region, or undefined if no framework definition exists.
 */
export function getRegionMetadata(regionId: string): RegionMetadata | undefined {
	return registry.get(regionId)?.metadata;
}
