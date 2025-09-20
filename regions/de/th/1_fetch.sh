set -e

echo "Fetching tiles..."
mkdir -p $DATA/tiles

# hardcoded sequence for 2024 orthophotos:
{ seq 549560 550273; seq 550991 551707; seq 562890 570961; seq 581473 583553; seq 588341 596566; } | shuf | parallel --eta --bar -j 4 '
  set -e
  ID={}
  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0
  
  curl -sko "$ID.tmp" "https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/download.php?type=op&id=$ID"
  mv "$ID.tmp" "$ID.zip"
  
  unzip -qo "$ID.zip" -d "$ID"
  rm "$ID.zip"

  TIF=$(find "./$ID/" -name "*.tif")
  COUNT=$(echo "$TIF" | wc -l)
  if [ "$COUNT" -ne 1 ]; then
    echo "more or less than 1 TIFs in $ID found: $COUNT"
    exit 1
  fi
  gdal_translate --quiet "$TIF" "$ID.jp2"
  mv "$ID.jp2" "$DATA/tiles/"
  rm -rf $ID
  rm -f $ID.*
'
