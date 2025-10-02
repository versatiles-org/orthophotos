set -e

if [ ! -f features.geojson ]; then
  echo -e "Fetching features.geojson..."
  curl -so features.geojson "https://fsn1.your-objectstorage.com/hwh-portal/20230609_tmp/links/nationaal/Nederland/BM_LRL2024O_RGB.json"
fi

echo "Downloading tiles..."
mkdir -p "$DATA/tiles"
jq -r '.features[] | .properties.file' features.geojson | parallel --eta --bar -j 4 '
  set -e
  URL={}
  ID=$(basename "$URL" .tif)
  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0
  curl -so "$ID.tif" "$URL"
  gdal_translate --quiet "$ID.tif" "$ID.jp2"
  mv "$ID.jp2" "$DATA/tiles/"
  rm -f $ID*
'