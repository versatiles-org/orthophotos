# CLAUDE.md

## Project Overview

Orthophoto tile pipeline: fetches aerial imagery from European national agencies, processes it through GDAL, converts to VersaTiles format, and serves tiles via a web frontend.

## Common Commands

```bash
npm run check              # Lint + format check + typecheck + tests (run before committing)
npm run lint               # ESLint
npm run test               # Run tests (vitest)
npm run typecheck          # TypeScript type checking
npm run format             # Auto-format with Prettier
npm run format:check       # Check formatting without modifying

./run.sh <region> <tasks>         # Run pipeline tasks for a region
npm run build:status              # Scan regions, validate status, export JSON
npm run server                    # Prepare data + start server on port 8080
```

## Code Style

- **Linter:** ESLint with typescript-eslint (flat config in `eslint.config.js`)
- **Formatter:** Prettier - single quotes, tabs, 120 char width, trailing commas
- **TypeScript:** Strict mode, ES2022 target, Node16 modules, noEmit
- **Tests:** Vitest, colocated `*.test.ts` files alongside source, fixtures in `test-data/`
- **Module type:** ESM (`"type": "module"` in package.json)
- **Node.js:** Requires >= 22 (uses `fs.promises.glob`)
- Use `.ts` extensions in imports (e.g., `import { foo } from './foo.ts'`)

## Architecture

### Pipeline Tasks (1-3)

Run via `./run.sh <region> <tasks>` (e.g., `./run.sh de/baden_wuerttemberg 1-3`):

| #   | Name   | Description                                                                                   |
| --- | ------ | --------------------------------------------------------------------------------------------- |
| 1   | fetch  | Download source data + per-file versatiles mosaic tile                                        |
| 2   | merge  | Merge .versatiles files locally via versatiles mosaic assemble, then upload to remote via scp |
| 3   | delete | Remove local data and temp directories                                                        |

Task spec supports: numbers (`2`), names (`fetch`), ranges (`1-3`), comma lists (`fetch,2-3`), `all` (full pipeline).

### Key Directories

- `src/` - TypeScript source code
  - `src/run.ts` - Main entry point
  - `src/run/` - CLI args, task implementations, command wrappers
  - `src/regions/` - Region definitions (metadata + fetch pipeline steps)
  - `src/server/` - VPL generation, frontend download
  - `src/status/` - Region scanning, status checking, GeoJSON loading
  - `src/lib/` - Utilities (command exec, retry, fs helpers, framework, validators, pipeline, progress)
- `data/` - NUTS TopoJSON reference data
- `web/` - Frontend assets
- `wms/` - WMS scraping utility

### Region Naming

Region IDs follow pattern `<cc>` or `<cc>/<name>` (e.g., `de`, `de/baden_wuerttemberg`). Names are ASCII-normalized from Unicode (e.g., `Baden-Württemberg` -> `baden_wuerttemberg`). Validation regex: `/^[a-z][a-z](\/[a-z_]+)?$/`

### Configuration

Environment variables loaded from `config.env`, accessed via `getConfig()` from `src/config.ts`:

- `dir_data` - Directory for large datasets and outputs (required)
- `dir_temp` - Directory for temporary processing files (required)
- `ssh_host`, `ssh_port`, `ssh_id`, `ssh_dir` - Remote storage SSH connection and base path (optional, required for merge + server)

### Region Statuses

Defined in `src/lib/framework.ts` as `RegionStatus`:

- `'planned'` — data source identified, scraper not yet implemented
- `'scraping'` — scraper implemented but result not yet released
- `'released'` — scraper works and result is published on the server
- `'blocked'` — cannot proceed (access restricted, proprietary format, etc.)

Only `'released'` regions are included in the VPL file for the server.

### New Tile Pipeline (`defineTileRegion`)

All regions use `defineTileRegion()` from `src/lib/process_tiles.ts`. The pipeline is: **init → download → convert → merge**.

**Design principles for `init`, `download`, and `convert`:**

- **`init`** must only return a list of items — it should NOT download or extract data. Fetching a small index/feed/API response and caching it in `tempDir` is fine, but heavy I/O belongs in `download`/`convert`.
- **`download`** fetches data for a single item (e.g., downloads a ZIP or TIF). Returns data for `convert`, `'empty'`/`'invalid'` to skip, or `void`.
- **`convert`** performs expensive processing (extraction, VRT building, versatiles conversion). Register temp files via `tileCtx.tempFile(path)` and the framework will clean them up automatically — no manual `try/finally + safeRm` needed.

**For regions with few large ZIP files** (e.g., `de/hamburg`, `de/bremen`): `init` returns one item per ZIP, `download` fetches the ZIP, `convert` extracts → builds VRT → converts to `.versatiles`. Use `extractZipAndBuildVrt()` for the extract+VRT step.

**Accepted exception — multi-file assembly inside `convert`:** Some source archives bundle a whole region's worth of imagery (e.g. `de/bremen`, `fr` BDORTHO). Splitting one item into many would force gigabytes of network re-fetches per output tile, so these regions do `extractZip → mosaicTile per inner image → mosaicAssemble` inside a single `convert`. New regions should not adopt this pattern unless the same "one giant archive per region" constraint applies.

```typescript
export default defineTileRegion({
    name: 'de/example',
    meta: { status: 'released', notes: [...], license: {...}, creator: {...}, date: '2024' },
    init: async (ctx) => {
        // Fetch index/feed, parse, return items. Use ctx.tempDir for caching.
        const feedPath = join(ctx.tempDir, 'feed.xml');
        if (!existsSync(feedPath)) await downloadFile(FEED_URL, feedPath);
        return parseFeed(await readFile(feedPath, 'utf-8'));
    },
    download: async ({ url, id }, ctx) => {
        const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
        const result = await downloadRaster(url, tifPath, ctx.errors, `${id}.tif`);
        if (result === 'invalid') return 'invalid';
        return { tifPath };
    },
    convert: async ({ tifPath }, { dest }) => {
        await runMosaicTile(tifPath, dest);
    },
    minFiles: 50,
});
```

**Interface:**

- `name` — region ID (e.g. `'de/thueringen'`)
- `meta` — region metadata (status, notes, license, creator, date)
- `init(ctx)` — returns `T[]` of items to process. Each item must have an `id: string`. Receives `StepContext` for access to `tempDir`/`dataDir`. Handle all index fetching and caching here.
- `downloadLimit?` — concurrency for `download`. Number, or `{ concurrency, memoryGB }`. Default: 4.
- `download(item, tileCtx)` — per-item download. Return data for `convert`, `'empty'` for missing tiles, `'invalid'` for bad downloads, or `void` for single-stage.
- `convertLimit?` — concurrency for `convert`. Same shape as `downloadLimit`. Use `{ memoryGB: N }` when each convert spawns parallel GDAL readers and you want to cap by host RAM.
- `convert(data, tileCtx)` — receives non-empty download result. Produce the final `.versatiles` file at `tileCtx.dest`.
- `minFiles` — minimum expected `*.versatiles` output files

**`TileContext`** passed to download/convert callbacks:

- `dest` — output path (`tiles/${id}.versatiles`)
- `skipDest` — skip marker path (`tiles/${id}.skip`) — write a marker here only for _probing_ regions where a tile permanently doesn't exist
- `tempDir` — temporary directory
- `tilesDir` — output tiles directory
- `errors` — `ErrorBucket` for collecting invalid download errors
- `tempFile(path)` — register a path for automatic cleanup after this item finishes (success, error, or `'empty'`/`'invalid'`). Returns the path unchanged so it can be used inline.

**Built-in behavior:** shuffles items, skips existing `.versatiles`/`.skip` files, shows progress bar, runs `expectMinFiles` after completion.

### Standard Fetch Patterns

Region fetch implementations should follow these patterns consistently:

**Atomic downloads:** `downloadFile()` downloads to `${dest}.tmp` then renames atomically, so partial files are never left behind.

**Atomic ZIP extraction:** Use `extractZipFile()` from `src/lib/fs.ts` instead of calling `unzip` directly. It extracts to a `.tmp` directory first, then renames atomically. This prevents incomplete extraction directories from being treated as completed work on subsequent runs.

**Network retries — required for every remote call:** National agency feeds and download endpoints regularly return 429s, 5xx, or close connections mid-stream. Every network operation in a region must be retried, or the pipeline will fail intermittently for reasons unrelated to the data.

- For raster downloads, prefer `downloadRaster(url, dest, errors, id)` — it composes `withRetry + downloadFile + isValidRaster` and returns `'invalid'` (with `errors.add`) if the file isn't a GDAL-readable raster. Pass a custom `{ retry: { ... } }` only if the default `maxAttempts: 3` doesn't fit.
- For non-raster fetches (index files, feeds, sidecars): wrap in `withRetry(() => downloadFile(url, dest), { maxAttempts: 3 })`. Built-in exponential backoff (1s → 2s → 4s, capped at 30s) is sufficient — don't tune unless you have a reason.
- For lists of downloads, pass `retry: { maxAttempts: 3 }` to `downloadFiles({ ... })` rather than wrapping each call.
- For paginated/rate-limited feeds, use `fetchWithInterval(items, fn, { intervalMs, retry: { maxAttempts: 3 } })` from `src/lib/rate-limit.ts`.
- Same rule for ad-hoc `fetch()` calls (e.g. HEAD requests for sizing). Wrap them.
- Exception: `gdal_translate` / `versatiles` invocations are local CPU work — do not retry (a failure is a real error, not transient).

**Download validation:** Every downloaded raster (TIF/JP2/etc.) must be validated. The simplest path is `downloadRaster()`, which validates internally. If you need a custom downloader (e.g. FTPS, insecure curl), call `isValidRaster()` from `src/lib/validators.ts` after the download and return `'invalid'` on failure.

**Error collection:** When a downloaded image fails validation, use `ErrorBucket` from `src/lib/validators.ts`. Call `errors.add(msg)` with a single descriptive string (e.g., `errors.add(\`\${id}.tif (\${url})\`)`), return `'invalid'`. The pipeline calls `errors.throwIfAny()` after completion. (`downloadRaster` does this for you.)

**Skip files (.skip) — only for coordinate probing:** Some regions (e.g. `de/baden_wuerttemberg`, `de/thueringen`, `pt`) probe a grid of coordinates or filenames where many tiles legitimately don't exist; the WMS-coverage regions `al`/`be` do the same when a block falls outside the served area. In those cases, write the marker via `writeFileSync(ctx.skipDest, '')` and return `'empty'` so re-runs skip the lookup. Never use `.skip` for transient download or validation failures — let those propagate via `withRetry` / `errors.add`.

**Resumability:** The pipeline automatically skips items with existing `.versatiles` or `.skip` files. Use `shuffle()` to distribute load across servers.

**Transparent borders:** Orthophoto tiles must not have black or white borders around the imagery. Borders cause visible rectangles when tiles are stacked. To ensure clean transparency:

- **Alpha channel:** If the source has an alpha channel (e.g., WMS with `Transparent=TRUE`), use it directly — `versatiles mosaic tile` respects alpha.
- **Nodata flag:** Use `runMosaicTile(input, output, { nodata: '0,0,0' })` to treat black as transparent, or `{ nodata: '255,255,255' }` for white. Multiple values can be joined with `;` (e.g., `{ nodata: '0,0,0;255,255,255' }`). Note: nodata only works reliably on lossless-compressed source data (e.g., DEFLATE, LZW, uncompressed). JPEG-compressed sources may have intermediate values at edges that don't match the exact nodata value.
- **GeoJSON masks:** Set `mask: true` (NUTS border) or `mask: 'file.geojson.gz'` in region metadata to apply `raster_mask` clipping at serving time. This is a final safety net but doesn't fix the source tiles.
- Always inspect the edges of a sample tile with `gdalinfo` + pixel value checks before assuming the border color.

**Temp file cleanup:** Register every per-item temp path with `tileCtx.tempFile(...)`. The framework deletes them after the item finishes, regardless of outcome (success, error, or `'empty'`/`'invalid'`):

```typescript
download: async ({ url, id }, ctx) => {
    const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
    const result = await downloadRaster(url, tifPath, ctx.errors, `${id}.tif`);
    if (result === 'invalid') return 'invalid';
    return { tifPath };
},
convert: async ({ tifPath }, { dest }) => {
    await runMosaicTile(tifPath, dest);  // no try/finally needed
},
```

`tempFile()` returns the path unchanged so it can be used inline. Index files cached in `init` (e.g. `feed.xml`, `index.html`) are _not_ item-scoped and should be cleaned up via `safeRm` if needed, or left for `task 3 (delete)` to remove.

### Versatiles CLI

The project uses the `versatiles` CLI tool with the `mosaic` subcommand:

- `versatiles mosaic tile <input> <output>` — tile a single raster into a `.versatiles` container
- `versatiles mosaic assemble <filelist> <output>` — assemble multiple containers into one

These are wrapped in `src/lib/versatiles.ts` as `runMosaicTile()` and `runMosaicAssemble()`. Quality and max-zoom settings are defined as constants (`MAX_ZOOM`, `QUALITY`) in `src/lib/constants.ts`. Both run with `quiet: true` to suppress output during normal operation. (GDAL CLI wrappers — `convertToTiledTiff()`, `extractWmsBlock()` — live in `src/lib/gdal.ts`. Region scrapers should import all of these via `src/regions/lib.ts`, never directly.)

`runMosaicTile()` supports options: `bands`, `nodata`, `crs`, `cacheDirectory`. Use `crs` to override the source CRS (e.g., `{ crs: '3045' }` for EPSG:3045) — this avoids needing `gdal raster edit` to assign CRS before conversion. Use `nodata` to treat specific pixel values as transparent (e.g., `{ nodata: '255,255,255' }` for white borders).

`runMosaicAssemble()` supports `lossless` option for lossless WebP encoding of translucent tiles.

The `versatiles` CLI is developed in the sibling repo `versatiles-rs`. If a region scraper needs a feature that `versatiles mosaic tile` or `versatiles mosaic assemble` doesn't support yet (e.g., a new CLI flag, a different output format, or improved input handling), the feature can be added to `versatiles-rs` and a new release built.

### VPL Generation and Region Masks

`generateVPL()` in `src/server/vpl.ts` builds a VPL file that stacks orthophoto layers (via SFTP) over satellite imagery. Regions can opt into border clipping via `raster_mask` by setting `mask` in their metadata:

- `mask: true` — uses the region's MultiPolygon from `data/NUTS_RG_03M_2024_4326.topojson.gz`
- `mask: 'filename.geojson.gz'` — uses a custom GeoJSON file from `data/`

Regions can also set `maskBuffer` to adjust the mask buffer distance in meters (negative values shrink the mask).

### Command Execution

`runCommand()` in `src/lib/command.ts` supports `quiet` and `quietOnError` options:

- `quiet: true` — suppresses stdout/stderr during execution (still captured for error messages)
- `quietOnError: true` — also suppresses output in error messages

### Data Source Research

The EU INSPIRE Geoportal orthoimagery theme is the best starting point for finding orthophoto data sources for EU countries: https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi

**Prefer a download service over WMS when picking a source.** When a national agency offers both an Atom feed / S3 bucket / direct HTTP listing of original tiles (GeoTIFF, JPEG 2000, etc.) AND a WMS endpoint, **always pick the download service.** Reasons, in priority order:

1. **Quality.** Original tiles preserve the source resolution, color depth, and (often) lossless compression. WMS re-renders to PNG/JPEG at our chosen pixel grid — every block is a re-encode loss, and edge alignment introduces visible seams.
2. **Throughput.** Direct downloads parallelise cleanly (one HTTP request per tile, often via CDNs). WMS endpoints are usually rate-limited per client and slow to render — see `bg`, `lt`, `lu`, `mt` notes for examples of "Server is slow".
3. **Stability.** A WMS layer rename or version change silently breaks the scraper (see the recent `bg` `RasterDataSet:` → `RasterData:` rename). A download service tends to expose a feed/manifest that's easier to detect breakage on.
4. **Reproducibility.** Direct tiles have a fixed checksum and are immune to the WMS server tweaking style/compression on us between runs.

Use WMS only when no download service exists, the download service uses a format we can't decode (see "Supported source formats" below), or the download service requires individual login per file. Mark the resulting region with a note in `meta.notes` calling out the WMS fallback so it's visible in the status table.

### Supported source formats

We can ingest anything GDAL can open with the open-source plugins shipped by stock builds (Homebrew on macOS, the `gdal-bin` package on Debian/Ubuntu). In practice that means:

- **Supported:** GeoTIFF, JPEG 2000 (`.jp2`/`.j2k` via OpenJPEG), PNG, JPEG, BMP, plus archive containers like ZIP and 7z that wrap any of the above.
- **NOT supported: ECW.** GDAL's ECW driver depends on Hexagon's proprietary ERDAS ECW SDK. We don't redistribute the SDK, the install script doesn't pull it.
- **MrSID** (`.sid`) is in the same boat — also a proprietary plugin, also unsupported.

Before adopting a new source, confirm GDAL can open a sample with a vanilla install: `gdalinfo path/to/sample.tif` (or `.jp2`, etc.). If `gdalinfo` reports "not recognized as being in a supported file format", the region belongs in `'blocked'`, not `'planned'`.

### External CLI Dependencies

Required tools: `7z`, `curl`, `gdal_translate`, `gdalbuildvrt`, `ssh`, `unzip`, `versatiles`

Install via `./install-dependencies.sh` (supports macOS via Homebrew and Linux via apt).
