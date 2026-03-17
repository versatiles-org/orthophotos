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
| 1 | fetch    | Execute region's `1_fetch.sh`                     |
| 2 | vrt      | Execute region's `2_build_vrt.sh`                 |
| 3 | preview  | Create 200x200px preview TIFF via gdalwarp        |
| 4 | convert  | Generate VPL, convert to .versatiles              |
| 5 | upload   | Rsync push to remote                              |
| 6 | delete   | Remove local data and temp directories            |

Task spec supports: numbers (`3`), names (`fetch`), ranges (`1-3`), comma lists (`fetch,2-3`), `all` (full pipeline with uploads between steps).

### Key Directories

- `src/` - TypeScript source code
  - `src/run.ts` - Main entry point
  - `src/run/` - CLI args, task implementations, command wrappers
  - `src/server/` - VPL generation, rsync, frontend download
  - `src/status/` - Region scanning, status.yml parsing, GeoJSON loading
  - `src/lib/` - Utilities (command exec, retry, fs helpers, YAML)
- `regions/<cc>/<region>/` - Per-region scripts (`1_fetch.sh`, `2_build_vrt.sh`) and `status.yml`
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

### External CLI Dependencies

Required tools: `7z`, `curl`, `gdal_translate`, `gdalbuildvrt`, `gdalwarp`, `htmlq`, `jq`, `parallel`, `rsync`, `unzip`, `versatiles`, `wget`, `xmlstarlet`
