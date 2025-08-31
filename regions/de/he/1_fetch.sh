set -e

mkdir -p tiles
mkdir -p temp
cd temp

wget -q -O atom.xml "https://www.geoportal.hessen.de/mapbender/php/mod_inspireDownloadFeed.php?id=0b30f537-3bd0-44d4-83b0-e3c1542ca265&type=DATASET&generateFrom=wmslayer&layerid=54936"

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" \
  -t -m '//a:entry//a:link' \
  -v 'concat(@href,"|",substring-before(substring-after(@title,"Teil ")," "))' -n atom.xml | \
  sed 's/amp;//g' > entries.txt

cat entries.txt | shuf | parallel --eta --bar -j 1 '
  set -e
  url=$(echo {} | cut -d"|" -f1)
  name=$(echo {} | cut -d"|" -f2)
  if [ ! -f "../tiles/$name.jp2" ]; then
    curl -s "$url" -o "$name.tif"
    gdal_translate --quiet -of JP2OpenJPEG "$name.tif" "$name.jp2" -co QUALITY=100
    mv "$name.jp2" "../tiles/"
    find . -name "$name.*" -delete
  fi
'

cd ..
rm -r temp
