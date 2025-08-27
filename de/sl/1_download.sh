set -e

mkdir -p temp
mkdir -p tiles
cd temp

curl -s "https://geoportal.saarland.de/mapbender/php/mod_inspireDownloadFeed.php?id=b92a9769-caf0-497d-9996-2be0a045ef62&type=DATASET&generateFrom=wmslayer&layerid=49554" >atom.xml

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" \
  -t -m '//a:link' \
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
