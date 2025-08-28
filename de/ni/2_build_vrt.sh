set -e

gdalbuildvrt -addalpha tiles.vrt tiles/*.tif
