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
  versatiles convert tiles_$name.vpl tiles_$name.versatiles
  versatiles convert tiles_$name.versatiles tiles_$name.mbtiles
done
