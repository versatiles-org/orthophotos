# CLAUDE.md

## Project Overview

Orthophoto tile pipeline: fetches aerial imagery from European national agencies, processes it through GDAL, converts to VersaTiles format, and serves tiles via a web frontend.

## Common Commands

```bash
npm run check              # Format check + typecheck + tests (run before committing)
npm run test               # Run tests (vitest)
npm run typecheck          # TypeScript type checking
npm run format             # Auto-format with Prettier
npm run format:check       # Check formatting without modifying

npm run run -- <region> <tasks>   # Run pipeline tasks for a region
npm run status-check              # Scan regions, validate status, export JSON
npm run server                    # Prepare data + start server on port 8080
```

## Code Style

- **Formatter:** Prettier - single quotes, tabs, 120 char width, trailing commas
- **TypeScript:** Strict mode, ES2022 target, Node16 modules, noEmit
- **Tests:** Vitest, colocated `*.test.ts` files alongside source, fixtures in `test-data/`
- **Module type:** ESM (`"type": "module"` in package.json)
- Use `.ts` extensions in imports (e.g., `import { foo } from './foo.ts'`)

## Architecture

### Pipeline Tasks (0-6)

Run via `npm run run -- <region> <tasks>` (e.g., `npm run run -- de/baden_wuerttemberg 1-4`):

| # | Name     | Description                                      |
|---|----------|--------------------------------------------------|
| 0 | download | Rsync pull existing data from remote              |
| 1 | fetch    | Run region's TypeScript pipeline or `1_fetch.sh`  |
| 2 | vrt      | Build VRT from metadata config or `2_build_vrt.sh`|
| 3 | preview  | Create 200x200px preview TIFF via gdalwarp        |
| 4 | convert  | Generate VPL, convert to .versatiles              |
| 5 | upload   | Rsync push to remote                              |
| 6 | delete   | Remove local data and temp directories            |

Task spec supports: numbers (`3`), names (`fetch`), ranges (`1-3`), comma lists (`fetch,2-3`), `all` (full pipeline with uploads between steps).

### Key Directories

- `src/` - TypeScript source code
  - `src/run.ts` - Main entry point
  - `src/run/` - CLI args, task implementations, command wrappers
  - `src/regions/` - Region definitions (metadata + fetch pipeline steps)
  - `src/server/` - VPL generation, rsync, frontend download
  - `src/status/` - Region scanning, status.yml parsing, GeoJSON loading
  - `src/lib/` - Utilities (command exec, retry, fs helpers, YAML, framework, validators, concurrent, progress)
- `regions/<cc>/<region>/` - Legacy per-region bash scripts (`1_fetch.sh`, `2_build_vrt.sh`) and `status.yml`
- `data/` - NUTS TopoJSON reference data
- `web/` - Frontend assets
- `wms/` - WMS scraping utility

### Region Naming

Region IDs follow pattern `<cc>` or `<cc>/<name>` (e.g., `de`, `de/baden_wuerttemberg`). Names are ASCII-normalized from Unicode (e.g., `Baden-Württemberg` -> `baden_wuerttemberg`). Validation regex: `/^[a-z][a-z](\/[a-z_]+)?$/`

### Configuration

Environment variables loaded from `config.env`:
- `dir_data` - Directory for large datasets and outputs (required)
- `dir_temp` - Directory for temporary processing files (required)
- `rsync_host`, `rsync_port`, `rsync_id` - Remote storage connection (required for sync tasks)

### Region Migration (Bash → TypeScript)

Regions are being migrated from bash scripts (`regions/<cc>/<region>/1_fetch.sh`) to TypeScript modules (`src/regions/<region>.ts`). Each migrated region file contains both metadata and pipeline steps.

**Already migrated:** `de/berlin`, `de/schleswig_holstein`, `de/bayern`, `de/brandenburg`, `de/hamburg`, `de/bremen`, `de/baden_wuerttemberg`, `de/hessen`, `de/mecklenburg_vorpommern`, `de/niedersachsen`, `de/nordrhein_westfalen`, `de/rheinland_pfalz`, `de/saarland`, `de/sachsen`, `de/sachsen_anhalt`, `de/thueringen`

**How to migrate a region:**

1. Read the bash script in `regions/<cc>/<region>/1_fetch.sh` to understand the fetch logic
2. Read `regions/<cc>/<region>/status.yml` for metadata (status, notes, license, creator, entries)
3. Verify the data source URLs still work; update if the API has changed
4. Create/update `src/regions/<cc>_<region>.ts` with:
   - **Metadata object** with all fields from `status.yml`, minus `rating`, plus `date` (when photos were taken, e.g. `'2025'`, `'2023-06'`, `'2017-2024'`)
   - **Pipeline steps** using `step()` from `src/lib/framework.ts`
5. Use library utilities: `downloadFile` (curl wrapper), `concurrent` (parallel processing with progress bar), `withRetry` (retry with backoff), `shuffle` (randomize order)
6. Use `fast-xml-parser` for XML/Atom feed parsing instead of regex
7. Add postcondition validation via `expectMinFiles`/`expectFile` from `src/lib/validators.ts`
8. Run `npm run check` to verify

**Required metadata fields:**
- `status`: `'success'` or `'error'`
- `notes`: string array describing quirks/issues
- `entries`: tile directory names (e.g. `['tiles']`)
- `license`: `{ name, url, requiresAttribution }`
- `creator`: `{ name, url }`
- `date`: when the photos were taken (must be added during migration)

**Fallback:** Regions without a TypeScript definition automatically fall back to running `1_fetch.sh` via bash.

### Standard Fetch Patterns

Region fetch implementations should follow these patterns consistently:

**Concurrency:** Import `CONCURRENCY` from `src/lib/concurrent.ts` (default: 4). Only define a local constant when a region or the download server genuinely needs a different value.

**Atomic downloads:** `downloadFile()` downloads to `${dest}.tmp` then renames atomically, so partial files are never left behind.

**Download validation:** After downloading a raster file (TIF), validate it with `isValidRaster()` from `src/lib/validators.ts` before converting. This uses `gdalinfo` to verify the file is GDAL-readable. Invalid files must be reported, not silently skipped.

**Error collection (not skip files):** When a downloaded image fails validation, use `DownloadErrors` from `src/lib/validators.ts`:
1. Create `const errors = new DownloadErrors()` before the `concurrent` loop
2. On invalid download: delete the file, call `errors.add(url, filename)`, return `'invalid'`
3. After the loop: call `errors.throwIfAny()` — this throws a single error listing all invalid files with their URLs
4. Do **not** create `.skip` files for invalid downloads — the pipeline should fail loudly so the issue is investigated

**Skip files (.skip) — only for coordinate probing:** Some regions (e.g. `de/baden_wuerttemberg`, `de/thueringen`) probe a grid of coordinates where many tiles don't exist. Use `.skip` files only for these "tile doesn't exist" cases to avoid re-probing on every run. Never use `.skip` for actual download failures.

**Resumability:** Check `existsSync(dest)` before downloading to skip already-completed tiles. Use `shuffle()` to distribute load across servers.

**Progress labels:** Use `{ labels: ['converted', 'skipped', 'invalid'] }` (or `['downloaded', 'skipped']` for direct downloads without conversion). Add `'empty'` only for regions with coordinate probing.

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

**VRT configuration:** Add `vrt` to metadata for declarative `gdalbuildvrt` config. Use `vrt: {}` for simple defaults (jp2 + addalpha). Override with `defaults: { ext, bands, srs, srcnodata, ... }`. Use `custom` callback only for complex cases (e.g. `cz`).

### External CLI Dependencies

Required tools: `7z`, `curl`, `gdal_translate`, `gdalbuildvrt`, `gdalwarp`, `htmlq`, `jq`, `parallel`, `rsync`, `unzip`, `versatiles`, `wget`, `xmlstarlet`
