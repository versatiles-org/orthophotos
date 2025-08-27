set -e

gdalwarp -tr 100 100 -r nearest -overwrite ni.vrt ni.tif
