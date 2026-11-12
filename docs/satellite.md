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

## Still to do

- **Blue Marble:** its build exists only as scripts on the storage box (`/home/satellite/bluemarble/`); move it here.
- **Fade at low zooms (#87):** a transition to Blue Marble with a constant width in pixels per zoom, replacing the fixed 10 km of `coastline-fade-mask`.
- **VPL:** point `src/server/vpl.ts` at the new satellite file once it's built and checked.
- **Clean up:** archive `versatiles-satellite`, move its open issue (snow becoming nodata, versatiles-satellite#2) here, and close #30.
