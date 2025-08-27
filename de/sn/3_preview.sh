set -e

gdalwarp -tr 100 100 -r nearest -overwrite sn.vrt sn.jp2
