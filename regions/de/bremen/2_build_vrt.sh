set -e

gdalbuildvrt -addalpha -a_srs "EPSG:25832" tiles_hb.vrt tiles_hb/*.jpg
gdalbuildvrt -addalpha tiles_bhv.vrt tiles_bhv/*.tif