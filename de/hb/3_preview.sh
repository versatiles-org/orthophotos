set -e

gdalwarp -tr 100 100 -r nearest -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite tiles_hb.vrt tiles_hb.jp2
gdalwarp -tr 100 100 -r nearest -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite tiles_bhv.vrt tiles_bhv.jp2
