set -e

gdalwarp -tr 100 100 -r average -overwrite rp.vrt rp.tif
