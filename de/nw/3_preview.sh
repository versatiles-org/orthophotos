set -e

gdal_translate -tr 100 100 -r nearest nw.vrt nw.tif
