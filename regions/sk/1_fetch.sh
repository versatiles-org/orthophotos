set -e

if [ ! -f index.txt ]; then
  echo "Fetching index..."
  curl -so index.xml "https://inspirews.skgeodesy.sk/atom/7efad194-3006-408f-9e6c-c06dc79703bd_dataFeed.atom"
  xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -v '//a:entry/a:link[contains(@href,".zip")]/@href' -n index.xml >index.txt
  rm index.xml
fi

mkdir -p $DATA/tiles
for url in $(cat index.txt); do
  ID=$(basename "$url" .zip)
  ID=${ID#orthoimagery_}

  [ -f "$DATA/tiles/$ID.check" ] && continue

  wget -cO "$ID.zip" "$url"

  unzip -od "$ID" "$ID.zip"
  rm "$ID.zip"

  files=$(find "$ID" -type f -name '*.tif')
  export DATA
  echo "$files" | parallel --eta --bar -j 1 '
    set -e
    id=$(basename {} .tif)
    [ -f "$DATA/tiles/$id.tif" ] && exit 0

    gdal raster edit --crs EPSG:3046 {}
    mv "{.}.tfw" "$DATA/tiles/" 2> >(grep -v "failed to preserve ownership" >&2)
    mv "{}" "$DATA/tiles/" 2> >(grep -v "failed to preserve ownership" >&2)
  '

  rm -r $ID

  echo "$files" > "$DATA/tiles/$ID.check"
done