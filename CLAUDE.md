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
npm run status-check              # Scan regions, validate status, export JSON
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

| # | Name   | Description                                                         |
|---|--------|---------------------------------------------------------------------|
| 1 | fetch  | Download source data + per-file versatiles mosaic tile              |
| 2 | merge  | Merge .versatiles files locally via versatiles mosaic assemble, then upload to remote via scp |
| 3 | delete | Remove local data and temp directories                              |

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
- **`convert`** performs expensive processing (extraction, VRT building, versatiles conversion). Cleans up temp files in `finally` blocks.

**For regions with few large ZIP files** (e.g., `de/hamburg`, `de/bremen`): `init` returns one item per ZIP, `download` fetches the ZIP, `convert` extracts → builds VRT → converts to `.versatiles`.

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
    download: async (item, { tempDir, errors }) => {
        const tifPath = join(tempDir, `${item.id}.tif`);
        try {
            await withRetry(() => downloadFile(item.url, tifPath), { maxAttempts: 3 });
            if (!(await isValidRaster(tifPath))) {
                errors.add(`${item.id}.tif (${item.url})`);
                return 'invalid';
            }
            return { tifPath };
        } catch (err) {
            try { rmSync(tifPath, { force: true }); } catch {}
            throw err;
        }
    },
    convert: async ({ tifPath }, { dest }) => {
        try {
            await runMosaicTile(tifPath, dest);
        } finally {
            try { rmSync(tifPath, { force: true }); } catch {}
        }
    },
    minFiles: 50,
});
```

**Interface:**
- `name` — region ID (e.g. `'de/thueringen'`)
- `meta` — region metadata (status, notes, license, creator, date)
- `init(ctx)` — returns `T[]` of items to process. Each item must have an `id: string`. Receives `StepContext` for access to `tempDir`/`dataDir`. Handle all index fetching and caching here.
- `downloadConcurrency?` — default: 4
- `download(item, tileCtx)` — per-item download. Return data for `convert`, `'empty'` for missing tiles, `'invalid'` for bad downloads, or `void` for single-stage.
- `convertCores?` — CPU cores per convert instance (default: 4). Concurrency is derived as `availableParallelism() / convertCores`.
- `convert(data, tileCtx)` — receives non-empty download result. Produce the final `.versatiles` file at `tileCtx.dest`.
- `minFiles` — minimum expected `*.versatiles` output files

**`TileContext`** passed to download/convert callbacks:
- `dest` — output path (`tiles/${id}.versatiles`)
- `skipDest` — skip marker path (`tiles/${id}.skip`)
- `tempDir` — temporary directory
- `tilesDir` — output tiles directory
- `errors` — `ErrorBucket` for collecting invalid download errors

**Built-in behavior:** shuffles items, skips existing `.versatiles`/`.skip` files, shows progress bar, runs `expectMinFiles` after completion.

### Standard Fetch Patterns

Region fetch implementations should follow these patterns consistently:

**Atomic downloads:** `downloadFile()` downloads to `${dest}.tmp` then renames atomically, so partial files are never left behind.

**Atomic ZIP extraction:** Use `extractZipFile()` from `src/lib/fs.ts` instead of calling `unzip` directly. It extracts to a `.tmp` directory first, then renames atomically. This prevents incomplete extraction directories from being treated as completed work on subsequent runs.

**Download validation:** After downloading a raster file (TIF/JP2), validate it with `isValidRaster()` from `src/lib/validators.ts` before converting. This uses `gdalinfo` to verify the file is GDAL-readable. Invalid files must be reported, not silently skipped.

**Error collection:** When a downloaded image fails validation, use `ErrorBucket` from `src/lib/validators.ts`. Call `errors.add(msg)` with a single descriptive string (e.g., `errors.add(\`\${id}.tif (\${url})\`)`), return `'invalid'`. The pipeline calls `errors.throwIfAny()` after completion.

**Skip files (.skip) — only for coordinate probing:** Some regions (e.g. `de/baden_wuerttemberg`, `de/thueringen`) probe a grid of coordinates where many tiles don't exist. Use `.skip` files only for these "tile doesn't exist" cases. Never use `.skip` for actual download failures.

**Resumability:** The pipeline automatically skips items with existing `.versatiles` or `.skip` files. Use `shuffle()` to distribute load across servers.

**Transparent borders:** Orthophoto tiles must not have black or white borders around the imagery. Borders cause visible rectangles when tiles are stacked. To ensure clean transparency:
- **Alpha channel:** If the source has an alpha channel (e.g., WMS with `Transparent=TRUE`), use it directly — `versatiles mosaic tile` respects alpha.
- **Nodata flag:** Use `runMosaicTile(input, output, { nodata: '0,0,0' })` to treat black as transparent, or `{ nodata: '255,255,255' }` for white. Multiple values can be joined with `;` (e.g., `{ nodata: '0,0,0;255,255,255' }`). Note: nodata only works reliably on lossless-compressed source data (e.g., DEFLATE, LZW, uncompressed). JPEG-compressed sources may have intermediate values at edges that don't match the exact nodata value.
- **GeoJSON masks:** Set `mask: true` (NUTS border) or `mask: 'file.geojson.gz'` in region metadata to apply `raster_mask` clipping at serving time. This is a final safety net but doesn't fix the source tiles.
- Always inspect the edges of a sample tile with `gdalinfo` + pixel value checks before assuming the border color.

**Temp file cleanup:** Always clean up temp files in a `finally` block:
```typescript
try {
    // download + convert
} finally {
    for (const p of [tifPath, jp2Path]) {
        try { rmSync(p, { force: true }); } catch {}
    }
}
```

### Versatiles CLI

The project uses the `versatiles` CLI tool with the `mosaic` subcommand:
- `versatiles mosaic tile <input> <output>` — tile a single raster into a `.versatiles` container
- `versatiles mosaic assemble <filelist> <output>` — assemble multiple containers into one

These are wrapped in `src/run/commands.ts` as `runMosaicTile()` and `runMosaicAssemble()`. Quality and max-zoom settings are defined as constants (`MAX_ZOOM`, `QUALITY`) in that file. Both run with `quiet: true` to suppress output during normal operation.

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

### External CLI Dependencies

Required tools: `7z`, `curl`, `gdal_translate`, `gdalbuildvrt`, `ssh`, `unzip`, `versatiles`

Install via `./install-dependencies.sh` (supports macOS via Homebrew and Linux via apt).
