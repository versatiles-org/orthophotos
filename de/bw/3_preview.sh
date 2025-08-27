set -e

gdalwarp -tr 100 100 -r nearest -multi -overwrite -wo NUM_THREADS=ALL_CPUS bw.vrt bw.jp2
