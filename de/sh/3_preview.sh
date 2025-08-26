set -e

gdalwarp -tr 100 100 -r average -overwrite sh.vrt sh.tif
