set -e

wget -O atom.xml "https://www.geodaten-mv.de/dienste/dop20_atom?type=dataset&id=f94d17fa-b29b-41f7-a4b8-6e10f1aae38e"

grep -oP 'href="[^"]+"' atom.xml | grep 'dop20rgbi_.*\.tif"' | cut -d'"' -f2 | sed 's/amp;//g' > urls.txt

mkdir -p $DATA/tiles
cat urls.txt | shuf | parallel --eta --bar -j 8 '
  set -e
  fname={}
  fname="${fname##*file=}"   # drop everything up to "file="
  fname="${fname%%&*}"       # drop any trailing &... if present
  [ -f "$DATA/tiles/$fname.jp2" ] && exit 0
  curl -s {} -o "$fname.tif"
  gdal_translate -q "$fname.tif" "$fname.jp2"
  mv "$fname.jp2" "$DATA/tiles/"
  rm "$fname.tif"
'
