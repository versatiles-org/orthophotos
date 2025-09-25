set -e

gdalbuildvrt -srcnodata "255 255 255" -b 1 -b 2 -b 3 -a_srs "EPSG:3045" tiles.vrt tiles/*.jp2
