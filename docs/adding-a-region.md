# Adding a Region

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
    convert: async ({ tifPath }, { dest, maxZoom }) => {
        await runMosaicTile(tifPath, dest, { maxZoom });
    },
    minFiles: 50,
});
```

**Interface:**

- `name` — region ID (e.g. `'de/thueringen'`)
- `meta` — region metadata (status, notes, license, creator, date, optional `maxZoom`)
- `init(ctx)` — returns `T[]` of items to process. Each item must have an `id: string`. Receives `TileInitContext`: `tempDir`/`dataDir`, and `maxZoom` for WMS block sizing (`computeWmsBlocks(bbox, ctx.maxZoom, …)`). Handle all index fetching and caching here.
- `downloadLimit?` — concurrency for `download`. Number, or `{ concurrency, memoryGB }`. Default: 4.
- `download(item, tileCtx)` — per-item download. Return data for `convert`, `'empty'` for missing tiles, `'invalid'` for bad downloads, or `void` for single-stage.
- `convertLimit?` — concurrency for `convert`. Same shape as `downloadLimit`. Use `{ memoryGB: N }` when each convert spawns parallel GDAL readers and you want to cap by host RAM.
- `convert(data, tileCtx)` — receives non-empty download result. Produce the final `.versatiles` file at `tileCtx.dest`, passing `tileCtx.maxZoom` to `runMosaicTile`.
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
- For lists of downloads, pass `retry: { maxAttempts: 3 }` to `downloadFiles({ ... })` rather than wrapping each call. When the items are multi-GB archives on a connection that drops mid-stream (e.g. IGN BD ORTHO 7z parts), also pass `download: { continue: true }` so each retry resumes from the `.tmp` partial via a `Range:` request — without it every retry restarts at 0% and exhausts `maxAttempts` long before the file completes. With resume enabled, bias `maxAttempts` higher (15–20) since each attempt now makes forward progress.
- For paginated/rate-limited feeds, use `fetchWithInterval(items, fn, { intervalMs, retry: { maxAttempts: 3 } })` from `src/lib/rate-limit.ts`.
- Same rule for ad-hoc `fetch()` calls (e.g. HEAD requests for sizing). Wrap them.
- Exception: `versatiles` invocations are local CPU work — do not retry (a failure is a real error, not transient). `gdal_translate` is local CPU when fed a local file but does HTTP work when reading from a WMS XML config; `extractWmsBlock()` already sets `GDAL_HTTP_MAX_RETRY=5` so individual sub-tile fetches retry on 429/500/502/503/504 internally, and the per-block call should still be wrapped in our `withRetry` for outages longer than that.

**Download validation:** Every downloaded raster (TIF/JP2/etc.) must be validated. The simplest path is `downloadRaster()`, which validates internally. If you need a custom downloader (e.g. FTPS, insecure curl), call `isValidRaster()` from `src/lib/validators.ts` after the download and return `'invalid'` on failure.

**Error collection:** When a downloaded image fails validation, use `ErrorBucket` from `src/lib/validators.ts`. Call `errors.add(msg)` with a single descriptive string (e.g., `errors.add(\`\${id}.tif (\${url})\`)`), return `'invalid'`. The pipeline calls `errors.throwIfAny()` after completion. (`downloadRaster` does this for you.)

**Skip files (.skip) — only for coordinate probing:** Some regions (e.g. `de/baden_wuerttemberg`, `de/thueringen`, `pt`) probe a grid of coordinates or filenames where many tiles legitimately don't exist; the WMS-coverage regions `al`/`be` do the same when a block falls outside the served area. In those cases, write the marker via `writeFileSync(ctx.skipDest, '')` and return `'empty'` so re-runs skip the lookup. Never use `.skip` for transient download or validation failures — let those propagate via `withRetry` / `errors.add`.

**No silent gaps — every download/convert failure must propagate:** A region's final output must never have holes caused by server errors. Every failure mode has exactly one correct path:

- **Network/server error during download** → throw (e.g. let `withRetry` exhaust, then propagate). The framework aborts the pipeline (`pipeline.ts:235-260`) and the region run fails.
- **Downloaded file fails validation** (`isValidRaster` returns false, wrong format, etc.) → call `ctx.errors.add(msg)` then `return 'invalid'`. `processTiles` calls `errors.throwIfAny()` at the end (`process_tiles.ts:189`), so the run still fails — but other items get a chance to download first.
- **Tile legitimately doesn't exist at the source** (out-of-coverage WMS block, source archive doesn't list this id, WMS server returns fully-black raster for outside-country areas) → `writeFileSync(ctx.skipDest, '')` then `return 'empty'`. Re-runs skip the lookup.
- **`minFiles`** is the third safety net: catastrophic failures where most items return `'empty'` are caught by `expectMinFiles` after the pipeline completes. Set `minFiles` based on the realistic floor of land tiles for the region.

**Anti-patterns to avoid:**

- Returning `'empty'` from a `try { ... } catch { return 'empty' }` block — that masks real failures. Catch only specific, known-safe errors (e.g. `bg.ts` catches just `RasterFormatException`); let everything else propagate.
- Using `curl` without `--fail` (or `-f`) for downloads. Without `--fail`, curl exits 0 on HTTP 4xx/5xx and writes the error body to disk; that body then flows through validation as if it were real data, and small error responses can be mistaken for legitimate empties. `downloadFile()` always passes `--fail`. For ad-hoc `runCommand('curl', ...)` calls, include `-f` (or `--fail`).
- Writing `.skip` for "I'm not sure what went wrong" cases. `.skip` is permanent; once written, re-runs won't refetch. Reserve it for things that are fixed by the data source (a tile that doesn't exist isn't going to start existing on the next run).

For "the response decoded fine but contains no actual data" (e.g. an all-black WMTS tile from outside the coverage area), use `isRasterAllZero(path)` from `src/lib/validators.ts` between `isValidRaster` and the convert stage (see `fi.ts` for an example). It's safe to write `.skip` in this case — the source won't suddenly start having data there.

**Resumability:** The pipeline automatically skips items with existing `.versatiles` or `.skip` files. Use `shuffle()` to distribute load across servers.

**Transparent borders:** Orthophoto tiles must not have black or white borders around the imagery. Borders cause visible rectangles when tiles are stacked. To ensure clean transparency:

- **Alpha channel:** If the source has an alpha channel (e.g., WMS with `Transparent=TRUE`), use it directly — `versatiles mosaic tile` respects alpha.
- **Nodata flag:** Use `runMosaicTile(input, output, { maxZoom, nodata: '0,0,0' })` to treat black as transparent, or `{ nodata: '255,255,255' }` for white. Multiple values can be joined with `;` (e.g., `{ nodata: '0,0,0;255,255,255' }`). Note: nodata only works reliably on lossless-compressed source data (e.g., DEFLATE, LZW, uncompressed). JPEG-compressed sources may have intermediate values at edges that don't match the exact nodata value.
- **GeoJSON masks:** Set `mask: true` (NUTS border) or `mask: 'file.geojson.gz'` in region metadata to apply `raster_mask` clipping at serving time. This is a final safety net but doesn't fix the source tiles.
- Always inspect the edges of a sample tile with `gdalinfo` + pixel value checks before assuming the border color.

**Top zoom:** Every region is tiled up to `MAX_ZOOM` (17) unless its metadata sets `maxZoom`. With 512-px tiles, a zoom-17 pixel is 0.60 m in Web Mercator, which is about 0.42 m on the ground at 45° N and 0.30 m at 60° N. Set `maxZoom: 16` for sources coarser than that, so the top zoom isn't upsampled. For finer sources, go up to the zoom that matches the source: 18 for about 20 cm, 19 for about 10 cm. `QUALITY` compresses zooms 18 and 19 hard (20 and 10), but each level still holds four times the tiles of the one below. An estimate for `de/nordrhein_westfalen` (10 cm), from one test square kilometre, puts the region at about 2.4 times its zoom-17 size with zoom 18, and 5.3 times with zoom 19. Always pass `maxZoom` through to `runMosaicTile` rather than leaving it to versatiles, which would round the source resolution up.

**Temp file cleanup:** Register every per-item temp path with `tileCtx.tempFile(...)`. The framework deletes them after the item finishes, regardless of outcome (success, error, or `'empty'`/`'invalid'`):

```typescript
download: async ({ url, id }, ctx) => {
    const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
    const result = await downloadRaster(url, tifPath, ctx.errors, `${id}.tif`);
    if (result === 'invalid') return 'invalid';
    return { tifPath };
},
convert: async ({ tifPath }, { dest, maxZoom }) => {
    await runMosaicTile(tifPath, dest, { maxZoom });  // no try/finally needed
},
```

`tempFile()` returns the path unchanged so it can be used inline. Index files cached in `init` (e.g. `feed.xml`, `index.html`) are _not_ item-scoped and should be cleaned up via `safeRm` if needed, or left for `task 3 (delete)` to remove.
