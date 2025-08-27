set -e

gdalwarp -tr 100 100 -r average -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite by.vrt by.jp2
