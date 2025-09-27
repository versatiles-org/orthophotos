set -e

if [ ! -f atom.xml ]; then
  echo "Fetching atom.xml..."
  curl -so atom.xml "https://geodatenportal.sachsen-anhalt.de/arcgisinspire/rest/directories/web/INSPIRE_ALKIS/ALKIS_OI_DOP20_MapServer/datasetoi.xml"
fi

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:link' -v '@href' -n atom.xml | sed 's/amp;//g' > urls.txt
cat urls.txt | grep -oE '[0-9]*' > ids.txt

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat ids.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  ID={}
  URL="https://www.geodatenportal.sachsen-anhalt.de/gfds_webshare/sec-download/LVermGeo/DOP20/$ID.tif"

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0

  curl -so "$ID.tif" "$URL"

  gdal raster edit --nodata 255 "$ID.tif"
  gdal_translate --quiet -b 1 -b 2 -b 3 -b mask -colorinterp_4 alpha "$ID.tif" "$ID.jp2"

  mv "$ID.jp2" "$DATA/tiles/"

  find . -name "$ID.*" -delete
'
