set -e

gdalbuildvrt -addalpha -a_srs "EPSG:25833" at.vrt tiles/*.tif
