set -e

if [ ! -f atom.xml ]; then
  echo "Fetching atom.xml..."
  curl -so atom.xml "https://geoportal.saarland.de/mapbender/php/mod_inspireDownloadFeed.php?id=6c2eb4e4-6b85-4858-93f8-b62a2ef87987&type=DATASET&generateFrom=wmslayer&layerid=46303"
fi

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" \
  -t -m '//a:link' \
  -v 'concat(@href,"|",substring-before(substring-after(@title,"Teil ")," "))' -n atom.xml |
  grep -v "mapbender" | \
  sed 's/amp;//g' > entries.txt

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat entries.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  URL=$(echo {} | cut -d"|" -f1)
  ID=$(echo {} | cut -d"|" -f2)

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0

  curl -so "$ID.tif" "$URL"
  gdal_translate --quiet -of JP2OpenJPEG "$ID.tif" "$ID.jp2"

  mv "$ID.jp2" "$DATA/tiles/"
  find . -name "$ID.*" -delete
'
