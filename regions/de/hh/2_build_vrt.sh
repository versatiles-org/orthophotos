set -e

gdalbuildvrt -b 1 -b 2 -b 3 -b 4 tiles.vrt tiles/*.tif
