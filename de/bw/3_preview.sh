set -e

gdal_translate -tr 100 100 -r nearest tiles.vrt tiles.jp2
