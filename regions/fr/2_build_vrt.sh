set -e

for name in \
  tiles_LAMB93 \
  tiles_RGAF09UTM20 \
  tiles_RGFG95UTM22 \
  tiles_RGM04UTM38S \
  tiles_RGR92UTM40S \
  tiles_RGSPM06U21 \
  tiles_UTM01SW84
do
  echo "Processing $name"
  gdalbuildvrt -addalpha $name.vrt $name/*.jp2
done
