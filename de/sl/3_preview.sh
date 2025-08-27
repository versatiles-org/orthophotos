set -e

gdalwarp -tr 100 100 -r nearest -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite sl.vrt sl.jp2
