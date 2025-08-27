set -e

gdal_translate -tr 100 100 -r nearest be.vrt be.tif
