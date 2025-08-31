set -e

wget -q -O atom.xml "https://www.geoportal.hessen.de/mapbender/php/mod_inspireDownloadFeed.php?id=0b30f537-3bd0-44d4-83b0-e3c1542ca265&type=DATASET&generateFrom=wmslayer&layerid=54936"

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" \
  -t -m '//a:entry//a:link' \
  -v 'concat(@href,"|",substring-before(substring-after(@title,"Teil ")," "))' -n atom.xml | \
  sed 's/amp;//g' > entries.txt

mkdir -p $DATA/tiles
cat entries.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  url=$(echo {} | cut -d"|" -f1)
  name=$(echo {} | cut -d"|" -f2)
  [ -f "$DATA/tiles/$name.jp2" ] && exit 0
  curl -s "$url" -o "$name.tif"
  gdal_translate --quiet -of JP2OpenJPEG "$name.tif" "$name.jp2" -co QUALITY=100
  mv "$name.jp2" "$DATA/tiles/"
  find . -name "$name.*" -delete
'
