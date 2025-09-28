set -e

mkdir -p $DATA/tiles

if [ ! -f coords.txt ]; then
  MINY=5561
  MAXY=5727
  MINX=557
  MAXX=769

  : > coords.tmp
  for ((X0=MINX; X0<MAXX; X0+=1)); do
    for ((Y0=MINY; Y0<MAXY; Y0+=1)); do
      echo "${X0} ${Y0}" >> coords.tmp
    done
  done
  mv coords.tmp coords.txt
fi

cat coords.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  X0=$(echo {} | cut -d" " -f1)
  Y0=$(echo {} | cut -d" " -f2)
  ID="32${X0}_${Y0}"

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0
  [ -f "$DATA/tiles/$ID.skip" ] && exit 0

  URL="https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/_ajax/overview.php?crs=EPSG%3A25832&bbox%5B%5D=$((X0*1000))&bbox%5B%5D=$((Y0*1000))&bbox%5B%5D=$(((X0+1)*1000))&bbox%5B%5D=$(((Y0+1)*1000))&type%5B%5D=op"
  curl -s $URL > "$ID.json"

  GID=$(jq -rc "[.result.features[].properties | select(.bildnr == \"$ID\")] | max_by(.bildflugnr).gid" "$ID.json")
  
  [ "$GID" == "null" ] && {
    touch "$DATA/tiles/$ID.skip";
    rm -f "$ID.json";
    exit 0;
  }
  
  curl -sko "$ID.zip" "https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/download.php?type=op&id=$GID"

  unzip -qo "$ID.zip" -d "$ID"
  rm "$ID.zip"

  TIF=$(find "./$ID/" -name "*.tif")
  if [ $(echo "$TIF" | wc -l) -ne 1 ]; then
    echo "more or less than 1 TIFs in $ID found"
    exit 1
  fi
  gdal_translate --quiet -b 1 -b 2 -b 3 -b mask -colorinterp_4 alpha "$TIF" "$ID.jp2"

  mv "$ID.jp2" "$DATA/tiles/"
  rm -rf $ID
  rm -f $ID.*
'
