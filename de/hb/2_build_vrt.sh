set -e

gdalbuildvrt -addalpha -a_srs "EPSG:25832" hb.vrt tiles_hb/*.jpg
gdalbuildvrt -addalpha bhv.vrt tiles_bhv/*.tif