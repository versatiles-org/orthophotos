set -e

if [ ! -f atom.xml ]; then
  echo "Fetching atom.xml..."
  curl -so atom.xml "https://www.geodaten-mv.de/dienste/dop20_atom?type=dataset&id=f94d17fa-b29b-41f7-a4b8-6e10f1aae38e"
fi

grep -oP 'href="[^"]+"' atom.xml | grep 'dop20rgbi_.*\.tif"' | cut -d'"' -f2 | sed 's/amp;//g' > urls.txt

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat urls.txt | shuf | parallel --eta --bar -j 8 '
  set -e
  ID={}
  ID="${ID##*file=}"   # drop everything up to "file="
  ID="${ID%%&*}"       # drop any trailing &... if present

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0
  
  curl -so "$ID.tif" {}
  
  gdal_translate -q "$ID.tif" "$ID.jp2"
  
  mv "$ID.jp2" "$DATA/tiles/"
  rm "$ID.tif"
'
