set -e

gdalwarp -tr 100 100 -r nearest -overwrite sl.vrt sl.jp2
