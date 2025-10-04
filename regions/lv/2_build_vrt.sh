set -e

gdalbuildvrt -addalpha -a_srs EPSG:3059 tiles.vrt tiles/*.jp2
