set -e

gdalbuildvrt -b 1 -b 2 -b 3 -addalpha tiles.vrt tiles/*.tif
