set -e

gdalwarp -tr 100 100 -r nearest -overwrite -f JP2OpenJPEG tiles.vrt tiles.jp2
