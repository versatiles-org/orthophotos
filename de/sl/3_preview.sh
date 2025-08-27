set -e

gdalwarp -tr 100 100 -r average -overwrite sl.vrt sl.jp2
