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

export interface RegionMetadata {
	status: 'success' | 'error';
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
