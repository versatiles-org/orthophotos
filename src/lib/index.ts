/**
 * Public surface for the `lib/` subsystem.
 *
 * All consumers outside `lib/` (regions/, server/, run/, status/, top-level
 * scripts) should import from `../lib/index.ts` rather than reaching into
 * individual files. This keeps the cross-directory dependency graph minimal —
 * one edge per consumer file — and gives a single place to discover what's
 * available.
 *
 * If something you need isn't exported here, add the export rather than
 * importing the underlying file directly.
 */

// Internal libs
export { shuffle } from './array.ts';
export {
	downloadFile,
	downloadFiles,
	formatErrorChain,
	runCommand,
	runCommandWithRetry,
	type DownloadOptions,
} from './command.ts';
export { MAX_ZOOM, QUALITY } from './constants.ts';
export { sleep } from './delay.ts';
export type { RegionMetadata, RegionPipeline, RegionStatus, StepContext } from './framework.ts';
export { extractZipFile, safeRm } from './fs.ts';
export { pipeline, skip, type Skip } from './pipeline.ts';
export { defineTileRegion, type TileContext, type TileItem } from './process_tiles.ts';
export { createProgress, type Progress, type ProgressOptions } from './progress.ts';
export { fetchWithInterval, type FetchWithIntervalOptions } from './rate-limit.ts';
export { listRemoteVersatilesFiles, type RemoteFile } from './remote-listing.ts';
export { RemoteZip, type ZipEntry } from './remote-zip.ts';
export { withRetry, type RetryOptions } from './retry.ts';
export {
	downloadRaster,
	ErrorBucket,
	isRasterAllZero,
	isValidRaster,
	type DownloadRasterOptions,
} from './validators.ts';
export {
	bboxIntersectsPolygon,
	lonLatTo3857,
	lonTo3857,
	latTo3857,
	pointInPolygon,
	projectGeometry3857,
} from './geometry.ts';
export { createXmlParser } from './xml.ts';
export {
	bboxesOverlap,
	computeWmsBlocks,
	generateWmsXml,
	parseWmsCapabilities,
	type GenerateWmsXmlOptions,
	type WmsBbox,
	type WmsBlockItem,
} from './wms.ts';

// External-tool wrappers
export {
	compositeRastersWithAlpha,
	convertToTiledTiff,
	extractWmsBlock,
	extractZipAndBuildVrt,
	type CompositeRastersOptions,
	type ExtractZipBuildVrtOptions,
} from './gdal.ts';
export { runMosaicAssemble, runMosaicTile } from './versatiles.ts';

// Cross-tree re-exports — pragmatic facade for region scrapers, routed through
// each subsystem's own index.ts so the directional dependency stays
// `lib → status` / `lib → config` only at the barrel level.
export { loadKnownRegions, type KnownRegion } from '../status/index.ts';
export { getConfig } from './config.ts';
