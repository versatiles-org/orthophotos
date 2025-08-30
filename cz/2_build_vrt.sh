set -e

gdalbuildvrt -addalpha -a_srs "EPSG:3045" tiles.vrt tiles/*.jp2
