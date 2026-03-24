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

export interface RegionMetadata {
	status: RegionStatus;
	notes: string[];
	entries?: string[];
	license?: RegionLicense;
	creator?: RegionCreator;
	date?: string;
}

export interface RegionPipeline {
	id: string;
	metadata: RegionMetadata;
	run?: (ctx: StepContext) => Promise<void>;
}
