set -e

if [ ! -f features.jsonl ]; then
  miny=5561000
  maxy=5727000
  minx=557000
  maxx=769000
  step=2000

  : > query_urls.txt
  for ((x0=minx; x0<maxx; x0+=step)); do
    for ((y0=miny; y0<maxy; y0+=step)); do
      x1=$((x0+step))
      y1=$((y0+step))

      echo "${x1}_${y1} https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/_ajax/overview.php?crs=EPSG%3A25832&bbox%5B%5D=${x0}&bbox%5B%5D=${y0}&bbox%5B%5D=${x1}&bbox%5B%5D=${y1}&type%5B%5D=op" >> query_urls.txt
    done
  done

  mkdir -p query_results
  echo "  Fetching list of tiles..."
  cat query_urls.txt | shuf | parallel --eta --bar -j 4 '
    set -e
    ID=$(echo {} | cut -d" " -f1)
    URL=$(echo {} | cut -d" " -f2-)
    OUT="query_results/$ID.json"
    [ -f "$OUT" ] && exit 0
    curl -s $URL > "$OUT.tmp"
    mv "$OUT.tmp" "$OUT"
  '

  cat query_urls.txt | shuf | cut -d" " -f1 | parallel --eta --bar -j 8 '
    set -e
    jq -rc ".result.features[].properties" "query_results/{}.json"
  ' | sort -u > features.jsonl
fi

jq -rs 'group_by(.bildnr) | map(max_by(.bildflugnr|tonumber) | .gid) | .[]' features.jsonl > gids.txt

cat gids.txt | shuf | parallel --eta --bar -j 4 '
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
