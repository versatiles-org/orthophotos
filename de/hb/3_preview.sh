set -e

gdalwarp -tr 100 100 -r average -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite hb.vrt hb.tif
gdalwarp -tr 100 100 -r average -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite bhv.vrt bhv.tif
