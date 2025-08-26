set -e

gdal_translate -tr 100 100 -r average LA93-0M20.vrt LA93-0M20.tif
gdal_translate -tr 100 100 -r average U01S-0M50.vrt U01S-0M50.tif
gdal_translate -tr 100 100 -r average U20N-0M20.vrt U20N-0M20.tif
gdal_translate -tr 100 100 -r average U21N-0M20.vrt U21N-0M20.tif
gdal_translate -tr 100 100 -r average U22N-0M20.vrt U22N-0M20.tif
gdal_translate -tr 100 100 -r average U38S-0M20.vrt U38S-0M20.tif
gdal_translate -tr 100 100 -r average U40S-0M20.vrt U40S-0M20.tif
