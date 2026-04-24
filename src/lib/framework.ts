/**
 * Core types and interfaces for region pipeline definitions.
 */

export interface StepContext {
	name: string;
	dataDir: string;
	tempDir: string;
}

export interface RegionLicense {
	name: string;
	url: string;
	requiresAttribution: boolean;
}

export interface RegionCreator {
	name: string;
	url: string;
}

/**
 * Region status:
 * - 'planned'  — data source identified, scraper not yet implemented
 * - 'scraping' — scraper implemented but result not yet released
 * - 'released' — scraper works and result is published on the server
 * - 'blocked'  — cannot proceed (access restricted, proprietary format, etc.)
 */
export type RegionStatus = 'planned' | 'scraping' | 'released' | 'blocked';

interface RegionMetadataBase {
	notes: string[];
	entries?: string[];
	license?: RegionLicense;
	creator?: RegionCreator;
	date?: string;
	/**
	 * GeoJSON mask for clipping raster data at region borders in the VPL.
	 * - `true`: use the region's MultiPolygon from the NUTS TopoJSON
	 * - string: path to a `.geojson.gz` file in `data/` (e.g. `'de_berlin.geojson.gz'`)
	 */
	mask?: boolean | string;
	/** Override the buffer distance (in meters) for the raster_mask in the VPL. Default: 0 */
	maskBuffer?: number;
	/**
	 * Roll this region up under a parent ID for status display (e.g. `'fr'` for all `fr/*`
	 * sub-régions). The pipeline still runs per-child; only `getAggregatedRegionMetadata()`
	 * collapses children into the named parent. Does not affect VPL generation.
	 */
	aggregateUnder?: string;
}

interface RegionMetadataReleased extends RegionMetadataBase {
	status: 'released';
	/** Date when the data was last released/published (e.g., '2025-03-27') */
	releaseDate: string;
}

interface RegionMetadataOther extends RegionMetadataBase {
	status: 'planned' | 'scraping' | 'blocked';
	releaseDate?: string;
}

export type RegionMetadata = RegionMetadataReleased | RegionMetadataOther;

export interface RegionPipeline {
	id: string;
	metadata: RegionMetadata;
	run?: (ctx: StepContext) => Promise<void>;
}
