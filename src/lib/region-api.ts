/**
 * Public surface used by region scrapers.
 *
 * Region files should import everything they need from `../lib/region-api.ts`
 * (or `../../lib/region-api.ts` from sub-region directories). This keeps the
 * dependency graph between `regions/` and the rest of the codebase narrow
 * (one edge per region) and gives a single place to discover what's available.
 *
 * If a region needs something that isn't exported here, add the export rather
 * than reaching into `../lib/...` directly.
 */

// Internal libs
export { shuffle } from './array.ts';
export { downloadFile, downloadFiles, runCommand, type DownloadOptions } from './command.ts';
export { MAX_ZOOM, QUALITY } from './constants.ts';
export { sleep } from './delay.ts';
export type { RegionMetadata, RegionPipeline, RegionStatus, StepContext } from './framework.ts';
export { extractZipFile, safeRm } from './fs.ts';
export { pipeline, skip, type Skip } from './pipeline.ts';
export { defineTileRegion, type TileContext, type TileItem } from './process_tiles.ts';
export { createProgress, type Progress, type ProgressOptions } from './progress.ts';
export { RemoteZip, type ZipEntry } from './remote-zip.ts';
export { fetchWithInterval, type FetchWithIntervalOptions } from './rate-limit.ts';
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
export { loadKnownRegions, type KnownRegion } from '../status/geojson.ts';
export { createXmlParser } from './xml.ts';
export {
	bboxesOverlap,
	computeWmsBlocks,
	generateWmsXml,
	parseWmsCapabilities,
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

// Config
export { getConfig } from '../config.ts';
