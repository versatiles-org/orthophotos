set -e

gdal_translate -tr 100 100 -r average bw.vrt bw.tif
