# Settlement proximity

Tiles of settlements should be compressed with a higher quality than tiles of a remote forest. The settlement-proximity PNG says how close each place is to settlement: one pixel per zoom-14 tile, 255 where the tile contains settlement, falling to 0 with distance. A tile encoder turns that value into a compression quality.

## Building it

```bash
npm run build:quality-zones -- <osm.versatiles> [output.png]
```

The input is the VersaTiles OSM planet (Shortbread schema), as published on download.versatiles.org: a local path or a URL. A local copy is much faster, because every zoom-14 tile is read. It needs `versatiles` 5.10.0 or later, the first version with the `vector_branch` operation.

The output defaults to `<dir_data>/settlement_proximity.png`. Intermediate files go to `<dir_temp>/quality_zones/`. Each step writes to a `.tmp.` file and renames it on success, and a step whose output exists is skipped, so an interrupted run resumes where it stopped. Delete a step's output to rerun it, and delete both outputs when the OSM input changes.

The code is in `src/quality-zones/`: `steps.ts` holds the parameters and the exact commands, `build.ts` runs them.

## Steps

1. **Measure tile sizes** (`versatiles dev measure-tile-sizes --level 14`): reads the input through a VPL pipeline (`settlement.vpl` in the temp dir) that keeps only the `buildings` layer and the `land` features of kind `residential`, `commercial` or `industrial`. The result, `tile_sizes.png`, is a 16384 × 16384 grayscale PNG with one pixel per zoom-14 tile and a value of `10 × log2(size in bytes)`. A tile with no features left measures 0, any other tile more. versatiles processes the tiles on all cores, but it re-encodes each filtered tile, brotli-compressed, just to measure it, so this is the slow step: hours for the planet.
2. **Settlement proximity** (one `gdal raster pipeline`, seconds):
   1. `reclassify`: every nonzero pixel becomes 255, the rest 0.
   2. `proximity`: the Euclidean distance in pixels to the nearest 255 pixel, up to `MAX_DISTANCE`. Pixels beyond it get the value `MAX_DISTANCE` too.
   3. `scale`: distance 0 becomes 255 and `MAX_DISTANCE` becomes 0, linearly, as bytes.

Parameters, all in `src/quality-zones/steps.ts`:

| Parameter      | Value                                     | Note                                       |
| -------------- | ----------------------------------------- | ------------------------------------------ |
| `ZOOM`         | 14                                        | one pixel per tile: 16384 px, about 2446 m |
| `LAND_KINDS`   | `residential`, `commercial`, `industrial` | `land` kinds that count, besides buildings |
| `MAX_DISTANCE` | 5                                         | pixels until the value has fallen to 0     |

With `MAX_DISTANCE = 5`:

| Distance (px) | 0   | 1   | 1.41 (diagonal) | 2   | 3   | 4   | ≥ 5 |
| ------------- | --- | --- | --------------- | --- | --- | --- | --- |
| Value         | 255 | 204 | 183             | 153 | 102 | 51  | 0   |

Distances are in pixels, that is in zoom-14 tiles, so they're the same number of tiles at every latitude. In ground metres a pixel is about 2446 m at the equator and half that at 60° north.

## Contract

This is what a consumer, such as a future `raster_format` extension in `versatiles-rs`, can rely on.

**File.** An 8-bit grayscale PNG, 16384 × 16384 pixels, without nodata. It carries no georeference: it always covers the full Web Mercator square (EPSG:3857, ±20037508.34 m in both axes), with pixel `(x, y)` being zoom-14 tile `(x, y)` in XYZ order, so row 0 is the northern edge.

**Values.** 255 means the tile contains a building or `land` of a settlement kind. Other values fall linearly with the Euclidean distance in pixels to the nearest such tile: `255 × (1 − distance / MAX_DISTANCE)`, and 0 from `MAX_DISTANCE` on. Distances don't wrap around the antimeridian, so settlement at one edge of the square doesn't raise values at the other.

**Reading it for a tile.** A tile above zoom 14 lies inside one pixel: zoom `z` tile `(x, y)` reads pixel `(x >> (z − 14), y >> (z − 14))`. A tile below zoom 14 covers `2^(14 − z)` × `2^(14 − z)` pixels, and the sensible value for it is their maximum, so a tile that contains any town gets the town's quality.

**From value to quality.** The file doesn't define it; that's the consumer's choice. A natural rule is to interpolate, per zoom level, between a quality for 0 and a quality for 255, using the `quality` syntax of `raster_format quality=` in `versatiles-rs` (`parse_quality` in `versatiles_pipeline/src/operations/raster/raster_format.rs`). For example, `70,16:30,17:10` far away and `70,16:50,17:30` in settlements.
