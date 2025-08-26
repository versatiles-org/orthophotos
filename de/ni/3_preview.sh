set -e

gdalwarp -tr 100 100 -r average -overwrite ni.vrt ni.tif
