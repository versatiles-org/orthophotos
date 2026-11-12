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
npm run build:quality-zones -- <osm.versatiles>  # Build the settlement-proximity PNG, see docs/quality-zones.md
./run.sh satellite/sentinel2 1-3          # Build the satellite base layer, see docs/satellite.md
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

### Adding or Changing a Region

Before adding a region or changing a region's fetch code, read `docs/adding-a-region.md`: it covers the `defineTileRegion` pipeline and the required fetch patterns (retries, validation, skip files, borders, temp files). What to record about a source and how to check it for newer data is in `docs/region-sources.md`.

### Building a Release

Before rebuilding regions for a new release, follow the checklist in `docs/building-a-release.md`: tools, newer data sources, clearing remote files and local caches, testing on a sample, and the checks after the build.

### Versatiles CLI

The project uses the `versatiles` CLI tool with the `mosaic` subcommand:

- `versatiles mosaic tile <input> <output>` — tile a single raster into a `.versatiles` container
- `versatiles mosaic assemble <filelist> <output>` — assemble multiple containers into one

These are wrapped in `src/lib/versatiles.ts` as `runMosaicTile()` and `runMosaicAssemble()`. Quality and the default top zoom are defined as constants (`QUALITY`, `MAX_ZOOM`) in `src/lib/constants.ts`; a region can set its own `maxZoom` in its metadata (see `docs/adding-a-region.md`). Both run with `quiet: true` to suppress output during normal operation. (GDAL CLI wrappers — `convertToTiledTiff()`, `extractWmsBlock()` — live in `src/lib/gdal.ts`. Region scrapers should import all of these via `src/regions/lib.ts`, never directly.)

`runMosaicTile()` requires `maxZoom` (pass `ctx.maxZoom` from the tile context) and supports options: `bands`, `nodata`, `crs`, `cacheDirectory`. Use `crs` to override the source CRS (e.g., `{ crs: '3045' }` for EPSG:3045) — this avoids needing `gdal raster edit` to assign CRS before conversion. Use `nodata` to treat specific pixel values as transparent (e.g., `{ nodata: '255,255,255' }` for white borders).

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
