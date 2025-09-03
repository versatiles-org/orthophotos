set -e

if [ ! -f ids.txt ]; then
  echo "Generating IDs..."
  touch ids.txt
  for ((x=387; x<=609; x += 2)); do
    for ((y=5264; y<=5514; y += 2)); do
      echo "${x}_${y}" >> ids.txt
    done
  done
fi

echo "Processing IDs..."
mkdir -p "$DATA/tiles"
shuf < ids.txt | parallel --eta --bar -I '###' '
  set -e

  ID="###"

  # Skip if already processed
  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0
  [ -f "$DATA/tiles/$ID.skip" ] && exit 0

  # Download atomically
  curl -s "https://opengeodata.lgl-bw.de/data/dop20/dop20rgb_32_${ID}_2_bw.zip" -o "$ID.tmp"
  if (( $(stat -c %s "$ID.tmp") < 1000 )); then
    touch "$DATA/tiles/$ID.skip"
    rm "$ID.tmp"
    exit 0
  fi

  mv "$ID.tmp" "$ID.zip"
  unzip -qo "$ID.zip" -d "$ID"
  rm -f "$ID.zip"

  gdalbuildvrt -q -addalpha -allow_projection_difference -a_srs "EPSG:25832" "$ID.vrt" "$ID/dop20rgb_32_${ID}_2_bw/"*.tif
  
  gdal_translate --quiet "$ID.vrt" "$ID.jp2"

  mv "$ID.jp2" "$DATA/tiles/"
  rm -f $ID.*
  rm -rf $ID
'