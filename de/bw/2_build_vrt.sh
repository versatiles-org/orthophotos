set -e

gdalbuildvrt -addalpha -allow_projection_difference -a_srs "EPSG:25832" bw.vrt tiles/*.jp2
