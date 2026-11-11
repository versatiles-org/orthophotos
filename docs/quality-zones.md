# Quality zones

Tiles of settlements should be compressed with a higher quality than tiles of a remote forest. The quality-zones GeoJSON says which quality applies where: it splits the world into three zones by distance to settlement, and gives each zone a zoom-dependent `quality`.

## Building it

```bash
npm run build:quality-zones -- <planet.osm.pbf> [output.geojson]
```

The output defaults to `<dir_data>/quality_zones.geojson`. Intermediate files go to `<dir_temp>/quality_zones/`. Each step writes to a `.tmp.` file and renames it on success, and a step whose output exists is skipped, so an interrupted run resumes where it stopped. Delete a step's output to rerun it, and delete all of them when the OSM input changes.

The code is in `src/quality-zones/`: `steps.ts` holds the parameters and the exact commands, `build.ts` runs them.

## Steps

1. **Filter** (`osmium tags-filter`): ways and relations with `building=*` or `landuse=residential|commercial|industrial`.
2. **Export** (`osmium export`): their polygons as GeoJSONSeq. The node location index is a `sparse_file_array` in the temp dir. GDAL's GeoJSONSeq reader seeks backwards, so this must be a file, not a pipe.
3. **Rasterize** (`gdal pipeline`): drop polygons whose bounding box lies outside the latitude limit of Web Mercator, reproject to EPSG:3857, then burn with `--all-touched` into a 16384 × 16384 byte grid over the full Mercator square (about 2446 m per pixel). The rasterize extent cuts off whatever reaches beyond the Mercator square; a GEOS `clip` would do the same at about twice the cost per polygon. Settlement pixels are 255, all others 0 (nodata).
4. **Polygonize** (`gdal raster polygonize`, diagonal pixels connected): the settlement pixels as polygons.
5. **Buffer A**: buffer by 1000 m, union, simplify.
6. **Buffer B**: buffer A by 4000 m, union, simplify.
7. **Zones**: A is buffer A. B is buffer B minus buffer A. C is the world square minus buffer B.
8. **Write and check**: tag each zone with its `quality`, write the GeoJSON, and fail if `gdal vector check-geometry` finds invalid geometries or `gdal vector check-coverage` finds gaps or overlaps.

Parameters, all in `src/quality-zones/steps.ts`:

| Parameter       | Value                                                | Note                                            |
| --------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Raster size     | 16384 px                                             | about 2446 m per pixel                          |
| Buffer A / B    | 1000 m / 4000 m                                      | EPSG:3857 metres, see below                     |
| Simplify        | 200 m                                                | tolerance                                       |
| Buffer segments | 4 per quarter circle                                 | GEOS default is 8; fewer keeps the file smaller |
| Zone A, B, C    | `70,16:50,17:30`, `70,16:40,17:20`, `70,16:30,17:10` |                                                 |

Distances are in EPSG:3857 metres, not ground metres. A Mercator metre is `cos(latitude)` ground metres, so the 1 km buffer is 1 km on the ground at the equator and 500 m at 60° north. In return, a buffer covers the same number of tiles at every latitude.

## Contract

This is what a consumer, such as a future `raster_format` extension in `versatiles-rs`, can rely on.

**File.** A GeoJSON `FeatureCollection` as written by GDAL. It is not RFC 7946: coordinates are EPSG:3857 metres, and the file names its CRS in the pre-RFC `crs` member:

```json
"crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::3857" } }
```

Coordinates are integers (whole metres).

**Features.** Exactly three, one per zone, in the order A, B, C. Each has:

| Member               | Type           | Content                                              |
| -------------------- | -------------- | ---------------------------------------------------- |
| `geometry`           | `MultiPolygon` | OGC-valid. Polygons may have holes.                  |
| `properties.quality` | string         | A `raster_format` `quality` value, see below         |
| `properties.zone`    | string         | `"A"`, `"B"` or `"C"`. Informational, for debugging. |

**Coverage.** The three zones together cover the square from −20037509 to 20037509 in both axes, which contains the whole Web Mercator extent (±20037508.34). Their interiors don't overlap. Neighbouring zones share their boundary exactly, so a point on a boundary is in two zones; a consumer has to choose, and should choose the higher quality.

**`quality` syntax.** The same as `raster_format quality=` in `versatiles-rs` (`parse_quality` in `versatiles_pipeline/src/operations/raster/raster_format.rs`): a comma-separated list where the first value is the default and each `zoom:value` pair applies from that zoom upwards. `70,16:50,17:30` means 70 up to zoom 15, 50 at zoom 16 and 30 from zoom 17.

**Choosing a zone for a tile.** The contract leaves this to the consumer. A tile overlaps several zones near a boundary, and the sensible rule is to use the highest quality of any zone the tile touches, so a tile at the edge of a town gets the town's quality.
