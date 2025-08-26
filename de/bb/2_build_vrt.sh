set -e

gdalbuildvrt -addalpha -a_srs "EPSG:25833" bb.vrt tiles/*.jpg
