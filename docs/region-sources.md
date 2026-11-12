# Region sources

What to record about each region's data source, and how to check a source for newer data. Writing a scraper is covered in [adding-a-region.md](adding-a-region.md); the release steps in [building-a-release.md](building-a-release.md).

## What to record

Everything about a source lives in its region file, so the next check starts from there instead of from scratch.

| Where                     | What                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta.date`               | Acquisition years of the imagery the scraper fetches, not the release date. A range where the source mixes years (`'2022-2026'`).                                                                                                                                         |
| `meta.resolution`         | Ground pixel size of the source in cm, the finest where it varies. Only once confirmed by the files, the provider's description or an official product name like DOP20; leave it out rather than guess.                                                                   |
| `meta.checked`            | Date of the last check of the source for newer data (`YYYY-MM-DD`).                                                                                                                                                                                                       |
| `meta.maxZoom`            | Derived from the resolution, see "Top zoom" in [adding-a-region.md](adding-a-region.md).                                                                                                                                                                                  |
| `meta.notes`              | Facts for the status page: kind of source (download service or WMS fallback), quirks such as a slow server or missing licence terms, mixed sources. Add the issue number when a source is broken (`'Download API down (#88).'`).                                          |
| Comment at the source URL | How the source publishes updates (a year in the URL, a hand-made list, a cached feed) and every decision against an alternative, with the reason and the month. Examples: the 3rd cycle in `sk.ts`, the leaf-off imagery in `de/hamburg.ts`, the city flights in `pl.ts`. |
| GitHub issue              | A source that is broken, blocked or can't be used yet, with what was checked and when. Title it with the region code (`hu: …`).                                                                                                                                           |

The status page shows date, resolution and checked date per region (`npm run build:status`).

## Checking a source for updates

1. **Read the region file:** source URLs, `meta.date`, the notes and the comment at the source URL, and the open issues for the region.
2. **Find what the provider offers now:** read the listing, feed, STAC or WFS index, or WMS capabilities. Acquisition years are in file names, metadata files inside the archives (GML, HTML), feed timestamps, layer titles, or footprint layers of the same service.
3. **Read files remotely instead of downloading them:** `gdalinfo /vsicurl/<url>` reads a GeoTIFF or JPEG 2000 header, `gdal vsi list /vsizip//vsicurl/<url>` lists a remote ZIP, and `gdal vsi copy` fetches a single small file (world file, metadata) out of one.
4. **Confirm the resolution** from a header or world file, and compare it with what the scraper requests. A WMS block's pixel size is its width divided by its pixel count.
5. **Look at a sample** at full resolution before switching sources: watermarks (the Slovak 3rd cycle), a white fill instead of transparency (Albania 2018), seams or halos at the edges (Luxembourg's JPEG 2000).
6. **Check whether the source moved,** changed its format, or now has a download service that can replace a WMS fallback.
7. **Record the result** as above, also when nothing changed: at least `meta.checked`.

## Known traps

- **Caches that are never refetched.** `items.ndjson` in `<dir_data>/<id>/` holds the item list, and several scrapers cache their index in `<dir_temp>`: the French index in `<dir_temp>/fr/index/`, Austria's `service.xml` and `tile_urls.json`, Berlin's `feed.xml`, Saarland's `atom.xml`. A check that finds new data needs those deleted before the rebuild.
- **Year-specific addresses.** Berlin (`oi_dop<year>`) and Saarland (`freewms/dop<year>`) put the year into the URL, Austria lists its flight blocks by hand (`OPERATS`), and France checks `FR_DATE_RANGE` against the feed. A new campaign needs a code change there.
- **Error pages with status 200.** An outage page instead of JSON (Thüringen), an XML error instead of a WMS image (caught by `isValidRaster`). And the other way round: a guessed file name that used to return a tiny file now returns 404 (Baden-Württemberg).
- **Redirects.** `curl -sf` without `-L` turns a moved domain into an empty answer, which a scraper may record as "no data" (Estonia).
- **Paging without a sort order.** A WFS without `sortBy` returns overlapping pages, so features repeat and others go missing (Poland).
- **Mixed coordinate systems.** Austria's flight blocks use three Gauss-Krüger zones; compare footprints only after reprojecting.
- **Bot protection.** Some portals block automated requests (opendata.swiss, a CAPTCHA on geoportal.thueringen.de). Use their APIs or check by hand; don't work around the protection.
- **Licence and terms.** A tile cache without licence terms and with bulk export switched off (Cyprus 2019) is not a source, however good the imagery.
