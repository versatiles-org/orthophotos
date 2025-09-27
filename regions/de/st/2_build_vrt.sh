set -e

gdalbuildvrt -allow_projection_difference -a_srs "EPSG:25832" tiles.vrt tiles/*.jp2