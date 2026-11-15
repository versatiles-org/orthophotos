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

This is what a consumer, such as `--quality-map` in `versatiles-rs`, can rely on.

**File.** An 8-bit grayscale PNG, 16384 × 16384 pixels, without nodata. It carries no georeference: it always covers the full Web Mercator square (EPSG:3857, ±20037508.34 m in both axes), with pixel `(x, y)` being zoom-14 tile `(x, y)` in XYZ order, so row 0 is the northern edge.

**Values.** 255 means the tile contains a building or `land` of a settlement kind. Other values fall linearly with the Euclidean distance in pixels to the nearest such tile: `255 × (1 − distance / MAX_DISTANCE)`, and 0 from `MAX_DISTANCE` on. Distances don't wrap around the antimeridian, so settlement at one edge of the square doesn't raise values at the other.

**Reading it for a tile.** A tile above zoom 14 lies inside one pixel: zoom `z` tile `(x, y)` reads pixel `(x >> (z − 14), y >> (z − 14))`. A tile below zoom 14 covers `2^(14 − z)` × `2^(14 − z)` pixels, and the sensible value for it is their maximum, so a tile that contains any town gets the town's quality.

**From value to quality.** The file doesn't define it; that's the consumer's choice. See "Using it" for this pipeline's.

## Using it

`versatiles mosaic tile` and `mosaic assemble` take the map as `--quality-map` (versatiles 5.12.0 and later). In place of a number, a zoom in `--quality` can then take a range, interpolated linearly between the map's 0 and 255: `16:30-50` is 30 far from settlements and 50 in them. A tile above zoom 14 reads its own pixel, and a tile below zoom 14 takes the highest quality of the pixels under it, as the contract describes. The parser is `versatiles_pipeline/src/helpers/quality.rs` in `versatiles-rs`.

**The map is switched off for now** (`QUALITY_MAP_ENABLED = false` in `src/lib/constants.ts`), until it is built on the build machine and the seams between quality zones have been checked (#86). `QUALITY` is then `70,16:50,17:30,18:20,19:10` and no map is read.

Switched on, `QUALITY` is `70,16:30-50,17:10-30,18:20,19:10`. The upper ends are the qualities used before the map existed, so settlements look as they did. The map is used only at 16 and 17: 18 and 19 are already compressed hard and are only reached by city sources. `runMosaicTile` and `runMosaicAssemble` then pass `<dir_data>/settlement_proximity.png` (`src/lib/quality-map.ts`), and `./run.sh` stops at startup if it is missing. `assemble` needs it too, because it re-encodes the tiles where inputs overlap.

Loading the map adds about 0.4 s and at most about 0.4 GB to each `versatiles` run.

### What it saves

A test with two 3 × 3 km crops of BD ORTHO Mayotte (20 cm), tiled to zoom 17, compared the opaque tiles at both ends of the ranges. Tiles with transparency are always encoded losslessly, so they aren't affected.

| Crop                  | z16, 50 → 30          | z17, 30 → 10          |
| --------------------- | --------------------- | --------------------- |
| Town and wooded hills | 42.1 → 30.1 KB (−29%) | 23.7 → 13.5 KB (−43%) |
| Closed forest         | 32.8 → 22.7 KB (−31%) | 18.8 → 10.4 KB (−45%) |

Zoom 17 holds about four fifths of the tiles, so an area far from settlement shrinks by about 40%. At quality 10 tree crowns look visibly softer than at 30 but stay readable. A file already tiled keeps its quality until it is tiled again.
