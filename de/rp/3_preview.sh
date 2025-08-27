set -e

gdalwarp -tr 100 100 -r nearest -multi -overwrite -wo NUM_THREADS=ALL_CPUS rp.vrt rp.jp2
