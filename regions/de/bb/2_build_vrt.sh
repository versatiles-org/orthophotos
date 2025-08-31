set -e

gdalbuildvrt -addalpha -a_srs "EPSG:25833" tiles.vrt tiles/*.jpg
