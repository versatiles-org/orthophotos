set -e

gdalwarp -tr 100 100 -r nearest -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite sn.vrt sn.jp2
