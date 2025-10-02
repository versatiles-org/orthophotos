set -e

if [ ! -f index.txt ]; then
  echo "Fetching index..."
  curl -s "https://s3.storage.pub.lvdc.gov.lv/lgia-opendata/ortofoto_rgb_v6/LGIA_OpenData_Ortofoto_rgb_v6_saites.txt" >index.tmp
  tr -d '\r' <index.tmp >index.txt
  rm index.tmp
fi

mkdir -p $DATA/tiles
cat index.txt | grep -E "\.tif$" | shuf | parallel --eta --bar -j 4 '
  set -e
  ID={/.}

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0

  curl -s {} -o "$ID.tif"
  curl -s {.}.tfw -o "$ID.tfw"

  gdal_translate --quiet "$ID.tif" "$ID.jp2"

  mv "$ID.jp2" "$DATA/tiles/" 2> >(grep -v "failed to preserve ownership" >&2)
  rm $ID.*
'
