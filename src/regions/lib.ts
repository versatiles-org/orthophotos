/**
 * Public surface used by region scrapers.
 *
 * Region files should import everything they need from `./lib.ts`. This keeps
 * the dependency graph between `regions/` and the rest of the codebase narrow
 * (one edge per region) and gives a single place to discover what's available.
 *
 * If a region needs something that isn't exported here, add the export rather
 * than reaching into `../lib/...` directly.
 */

// Internal libs
export { shuffle } from '../lib/array.ts';
export { downloadFile, downloadFiles, runCommand, type DownloadOptions } from '../lib/command.ts';
export { MAX_ZOOM, QUALITY } from '../lib/constants.ts';
export { sleep } from '../lib/delay.ts';
export type { RegionMetadata, RegionPipeline, RegionStatus, StepContext } from '../lib/framework.ts';
export { extractZipFile, safeRm } from '../lib/fs.ts';
export { pipeline, skip, type Skip } from '../lib/pipeline.ts';
export { defineTileRegion, type TileContext, type TileItem } from '../lib/process_tiles.ts';
export { createProgress, type Progress, type ProgressOptions } from '../lib/progress.ts';
export { RemoteZip, type ZipEntry } from '../lib/remote-zip.ts';
export { withRetry, type RetryOptions } from '../lib/retry.ts';
export { ErrorBucket, isValidRaster } from '../lib/validators.ts';
export { computeWmsBlocks, generateWmsXml, parseWmsCapabilities, type WmsBbox } from '../lib/wms.ts';

// External-tool wrappers
export { convertToTiledTiff, extractWmsBlock, runMosaicAssemble, runMosaicTile } from '../run/commands.ts';

// Config
export { getConfig } from '../config.ts';
