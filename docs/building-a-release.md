# Building a release

A checklist for rebuilding orthophoto regions and publishing them. Work through it top to bottom. Adding or fixing a single region is covered in [adding-a-region.md](adding-a-region.md).

## 1. Tools

- [ ] **versatiles with GDAL.** `versatiles mosaic tile` only exists when versatiles is built with the `gdal` feature. The release binaries on GitHub and the Homebrew formula don't have it. Install the release you want on the build machine with the GDAL development files present:

      ```bash
      cargo install versatiles --version <x.y.z> --features gdal
      ```

      Check with `versatiles --version` and `versatiles mosaic --help`, which must list `tile`. Make sure no older `versatiles` comes earlier in `PATH`. `./run.sh` stops at "Checking required commands" if `mosaic tile` is missing.

- [ ] **The release contains the fixes this build needs.** Read the versatiles-rs changelog since the last build, especially for `mosaic tile` and `mosaic assemble`. The machine that publishes needs a release with `saturation` in `raster_levels` (versatiles-rs#328, after v5.12.0), which the VPL uses for Blue Marble.
- [ ] **The checkout is current** and `npm run check` passes.

## 2. Data sources

- [ ] **Newer data per region.** For every region that will be rebuilt, check whether the provider offers a newer acquisition, a better resolution or a download service instead of WMS. Update the scraper and `meta.date` where it does. How to check, what to record and the known traps are in [region-sources.md](region-sources.md); set `meta.checked` either way. Some scrapers also check constants against the source, like `FR_DATE_RANGE` in `src/regions/fr/scraper.ts`.
- [ ] **Blocked and planned regions.** Check whether anything that blocked them has changed, such as a new open licence or download service.
- [ ] **Top zoom per region.** Pick `maxZoom` from the source resolution, see "Top zoom" in [adding-a-region.md](adding-a-region.md). Regions without one are tiled to `MAX_ZOOM` (17).

## 3. Clean state

The pipeline resumes wherever it finds earlier results, so anything left over from the last build gets reused as it is.

- [ ] **Remote files.** `./run.sh` skips fetch and merge for every region whose `<ssh_dir>/<id>.versatiles` already exists. Rename the old files or folder on the storage box, for example `de` to `de_old`, instead of deleting them. That keeps them as a fallback until the new release is checked.
- [ ] **Local region data.** Make sure `<dir_data>/<id>/` doesn't exist for any region you rebuild. It holds `items.ndjson`, the cached list of source files, which would hide new source files. It also holds `tiles/`, whose per-image containers would be reused with their old zoom and quality. Task 3 of the previous build normally deletes it, but check.
- [ ] **Shared caches.** The French index is cached in `<dir_temp>/fr/index/` for all `fr/*` regions, and cached pages are never fetched again. Delete it before a French rebuild, or the build won't see new editions. Look for similar caches in `<dir_temp>/` for other regions.
- [ ] **Coastline.** The land polygons for the coastline mask of the satellite layer are downloaded once to `<dir_data>/coastline/land-polygons.geojson`. Delete the file to get current ones from OSM; the next preview or publish downloads them again. See "Coastline" in [satellite.md](satellite.md).

## 4. Test on a sample

Before a large region runs for hours or days, tile a few neighbouring source images (a 2 × 2 block) with the region's own options. Assemble them the way the region does, for example with `--lossless` for `fr/*` and `de/bremen`. Then check:

- [ ] **Tile sizes per zoom.** Tiles along the seams between source images must not be much bigger than their neighbours. A grid in a size heat map means seam tiles were encoded losslessly. `versatiles dev measure-tile-sizes --level <z> <file.versatiles> <out.png>` draws one.
- [ ] **No borders.** No black or white edges, see "Transparent borders" in [adding-a-region.md](adding-a-region.md).
- [ ] **Top zoom.** Look at a tile at the top zoom. It should show real detail, not upsampled blur, at an acceptable quality.

## 5. Build

- [ ] **Run on the build server**, not on a laptop. Large regions take hours to days and need hundreds of GB.

      ```bash
      ./run.sh '<region or pattern>' 1-3    # e.g. 'de/*'
      ```

      Task 1 fetches and tiles, task 2 assembles and uploads, task 3 deletes the local files.

## 6. Check and publish

- [ ] **File sizes.** Compare each new `.versatiles` with its predecessor in the renamed folder, and similar regions with each other. A region much bigger than expected for its area and zoom needs a look; a heat map of tile sizes usually shows why.
- [ ] **Release dates.** Set `releaseDate` in the metadata of every rebuilt region, and `status: 'released'` for new ones.
- [ ] **Remote check.** `npm run check:remote` checks the metadata against the files on the storage box, including that each file's date matches its `releaseDate`.
- [ ] **Preview.** `npm run preview` serves everything as it will be published. Look at the rebuilt regions and their borders.
- [ ] **Publish.** `npm run publish:world` builds the combined `satellite.versatiles` on the remote. `npm run publish:hashes` adds the missing `.md5` and `.sha256` files.
- [ ] **Status page.** `npm run build:stats` reads size and tile counts of the region files on the remote into `data/region-stats.json` (commit it; CI has no SSH access), then `npm run build:status`. A KB/tile or KB/km² far from regions of the same resolution points at a broken source or over-compressed tiles.
- [ ] **Clean up.** Delete the renamed old files on the storage box once the release is checked, and close the issues the release resolves.
