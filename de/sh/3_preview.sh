set -e

gdalwarp -tr 100 100 -r nearest -overwrite sh.vrt sh.tif
