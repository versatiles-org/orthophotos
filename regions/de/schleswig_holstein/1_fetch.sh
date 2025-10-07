set -e

if [ ! -f atom.xml ]; then
  echo "Fetching atom.xml..."
  curl -so atom.xml "https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20.xml"
fi

cat atom.xml | grep -o 'href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_dop20rgbi.*\.xml"' | grep -oE 'dop20rgbi[^\.]*' > ids.txt

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat ids.txt | shuf | parallel --eta --bar -j 1 '
  set -e
  ID={}

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0

  curl -so "$ID.xml" "https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_$ID.xml"

  url=$(cat $ID.xml | grep -oE "https://udp.gdi-sh.de/fmedatastreaming.*?INTERPOLATION=cubic" | head -n1 | sed -r "s/amp\;//")

  curl -so "$ID.tif" "$url"

  if [ "$(wc -c < "$ID.tif")" -ne 46 ]; then
    gdal_translate --quiet "$ID.tif" "$ID.jp2" -co QUALITY=100
    mv "$ID.jp2" "$DATA/tiles/"
  fi
  
  find . -name "$ID.*" -delete
'
