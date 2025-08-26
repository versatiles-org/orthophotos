set -e

gdalbuildvrt -addalpha ni.vrt tiles/*.tif
