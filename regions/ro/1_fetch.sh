set -e

if [ ! -f index.txt ]; then
  echo "Fetching index..."
  curl -so index.xml "https://inspire.geomil.ro/network/rest/directories/arcgisforinspire/INSPIRE/OI_Download_MapServer/OI_Dataset.xml"
  xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -v '//a:entry/a:link[contains(@href,".zip")]/@href' -n index.xml >index.txt
  rm index.xml
fi

mkdir -p $DATA/tiles
cat index.txt | parallel --eta --bar -j 1 '
  set -e
  URL={}
  ID=$(basename "$URL" .zip)

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0

  curl -s "$URL" -o "$ID.zip"

  unzip -qod "$ID" "$ID.zip"
  rm "$ID.zip"

  gdalbuildvrt -q "$ID.vrt" "$ID"/*.tif

  gdal raster edit --nodata 0 "$ID.vrt"
  gdal_translate --quiet -b 1 -b 2 -b 3 -b mask -colorinterp_4 alpha -co QUALITY=100 -co REVERSIBLE=YES "$ID.vrt" "$ID.jp2"

  mv "$ID.jp2" "$DATA/tiles/" 2> >(grep -v "failed to preserve ownership" >&2)
  rm -r $ID
  rm $ID*
'
