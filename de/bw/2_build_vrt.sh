set -e

gdalbuildvrt -addalpha -allow_projection_difference -a_srs "EPSG:25832" tiles.vrt tiles/*.jp2
