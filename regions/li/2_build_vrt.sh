set -e

gdalbuildvrt -srcnodata "0 0 0" -addalpha tiles.vrt tiles/*.tif
