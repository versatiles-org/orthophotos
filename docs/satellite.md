# Satellite base layer

The orthophotos are stacked over a global satellite layer and, below it, NASA's Blue Marble (`src/server/vpl.ts`). This page covers the satellite layer built in this repository. It replaces the S2GM pipeline of the former `versatiles-satellite` repository.

## Source

The "Sentinel-2 Global Mosaics" collection of the Copernicus Data Space Ecosystem (CDSE), product `S2MSI_L3__MCQ`:

- **Mosaics:** one per quarter since 2020, built per pixel and band from the first quartile of three months of cloud-masked Sentinel-2 Level-2A data, so snow and clouds pass through less than in a median or medoid.
- **Format:** 10 m, in the Sentinel-2 tiling grid (about 100 km per tile, in the tile's UTM zone). Each band is a 16-bit Cloud-Optimized GeoTIFF with nodata −32768, reflectance × 10,000.
- **Coverage:** the build uses `QUARTER` in `src/satellite/sentinel2.ts`, currently 2025 Q3 (29,513 tiles, all 60 UTM zones). S2GM's newest complete global mosaic was 2024 Q3.
- **Licence:** the Copernicus Sentinel data legal notice. For modified data it requires the credit "Contains modified Copernicus Sentinel data [Year]".

## Access

The bands are read over S3 from the `eodata` bucket (endpoint `eodata.dataspace.copernicus.eu`) with free CDSE credentials. Create them in the CDSE dashboard and add them to `config.env`:

```
cdse_s3_access_key=…
cdse_s3_secret_key=…
```

## Running it

The satellite layer runs through the same tasks as a region, but isn't one: it's registered in `src/satellite/index.ts`, so it doesn't appear on the status page, in the orthophoto layers of the VPL or in `check:remote`.

```bash
./run.sh satellite/sentinel2 1-3
```

Per tile, task 1 reads the red, green and blue band, converts them losslessly to an 8-bit RGBA GeoTIFF with alpha from the nodata mask, and tiles it with `versatiles mosaic tile` up to zoom 13 (10 m). The colour stretch (`BLACK`, `WHITE`, `EXPONENT`) was tuned to match the brightness and contrast of the S2GM layer. Task 2 assembles the tiles; where neighbouring UTM zones overlap, alpha compositing joins them.

A test tile (Berlin, `33UUU`) took 45 s to read and convert and 12 s to tile, and gave a 65 MB container. The whole layer is a long run for the build server.

## Coastline

Sentinel-2 looks good on land and in a narrow strip of coastal water. Further out at sea the mosaics turn into a grey haze with visible swath edges, and the tiles reach up to 300 km offshore, ending in a staircase of squares. Blue Marble's ocean looks better there. So the VPL clips the satellite layer to the land, grown a few kilometres into the sea, and fades it out (`src/server/coastline.ts`):

- **Land:** OpenStreetMap's land polygons from osmdata.openstreetmap.de (ODbL, so credit "© OpenStreetMap contributors"), in the version simplified for low zooms. `ensureCoastline()` downloads and converts them once to `<dir_data>/coastline/land-polygons.geojson`, and `npm run preview`, `publish:world` and `publish:world:local` call it. Delete the file to get current ones. Lakes count as land, so the satellite layer covers them.
- **Fade per zoom (#87):** `COASTLINE_FADE` sets a distance per zoom range, used as both buffer and blur of `raster_mask`. The fade starts at the coast and ends twice the distance offshore: 1 km up to zoom 7, growing to 4 km from zoom 11. Up to about zoom 9 the mask follows the coast directly, which also hides that the polygons are simplified. At higher zooms the edge lies in open water, where Sentinel-2 and Blue Marble show the same sea. `raster_mask` measures in Web Mercator metres, in which a pixel of a zoom level has the same size everywhere, so each step has the same width in pixels anywhere in the world.
- **Cost:** each zoom range is its own masked layer, and Blue Marble's land layer (see below) is one more. Five copies of the 42 MB mask took about 1.4 GB of memory and 7 s when the pipeline starts, so six take about 1.7 GB.

The prototype for this was built around Lisbon, comparing it with masks from the Sentinel-2 coverage and from `coastline-fade-mask`'s land buffered by 10 km. Both left a wide band of grey or dark sea along the coast.

## Blue Marble's levels

Blue Marble shows at sea and where the satellite layer has no data: Antarctica (Sentinel-2 ends at 56.7° S) and the far north. The two need different levels (`src/server/vpl.ts`), so Blue Marble is stacked twice:

- **Land:** masked to the land polygons with a 2 km blur, `BLUEMARBLE_LAND_LEVELS` = `gamma=0.8 contrast=0.8`, the levels of the previous single layer. The ocean's levels blow the ice out to plain white.
- **Ocean:** below it, unmasked, `BLUEMARBLE_OCEAN_LEVELS` = `saturation=0.5 contrast=1.4 brightness=70`.

Measured on the whole globe at zoom 3:

|                                                                | Mean luma | Luma std | HSV saturation |
| -------------------------------------------------------------- | --------- | -------- | -------------- |
| Satellite land (S2GM)                                          | 115       | 50       | 0.28           |
| Blue Marble ocean, raw                                         | 23        | 18       | 0.86           |
| Blue Marble ocean, previous levels                             | 62        | 16       | 0.42           |
| Blue Marble ocean, `saturation=0.65 brightness=65 gamma=1.1`   | 80        | 18       | 0.28           |
| Blue Marble ocean, `saturation=0.5 contrast=1.4 brightness=70` | 52        | 26       | 0.42           |

- **Matching the land** in saturation (the fourth row) made the ocean too bright and flat. Matching its contrast breaks the image: the ocean's variation is bathymetry, not texture.
- **The chosen levels** were picked by eye from a few variants on the globe: the ocean stays clearly darker than the land, with more contrast in the bathymetry and less saturation than the raw image. `saturation` needs versatiles with versatiles-rs#328 (after v5.12.0).
- **`brightness`** is in 0–255 units. The previous `brightness=0.2` had practically no effect.

Whether the ocean should show bathymetry at all, or a flat colour or a mix, is open in #93. Re-measure once the Sentinel-2 layer replaces S2GM.

## Still to do

- **Blue Marble:** its build exists only as scripts on the storage box (`/home/satellite/bluemarble/`); move it here.
- **VPL:** point `src/server/vpl.ts` at the new satellite file once it's built and checked. The coastline mask applies to whichever satellite file it points at, today still S2GM.
- **Clean up:** archive `versatiles-satellite`, move its open issue (snow becoming nodata, versatiles-satellite#2) here, and close #30.
