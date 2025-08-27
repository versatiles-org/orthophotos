set -e

gdalwarp -tr 100 100 -r average -overwrite sn.vrt sn.jp2
