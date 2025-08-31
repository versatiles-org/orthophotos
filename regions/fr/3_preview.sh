set -e

for name in \
  LA93-0M20 \
  U01S-0M50 \
  U20N-0M20 \
  U21N-0M20 \
  U22N-0M20 \
  U38S-0M20 \
  U40S-0M20
do
  echo "Processing $name"
  gdalwarp -tr 100 100 -r nearest -multi -overwrite -wo NUM_THREADS=ALL_CPUS "tiles_$name.vrt" "tiles_$name.jp2"
done
