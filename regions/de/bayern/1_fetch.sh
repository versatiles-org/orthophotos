set -e


if [ ! -f gemeinde_urls.txt ]; then
  echo "Fetching gemeinde URLs..."
  curl -so gemeinde.kml "https://geodaten.bayern.de/odd/a/dop20/meta/kml/gemeinde.kml"
  grep -Eo 'https://geodaten\.bayern\.de/odd/a/dop20/meta/metalink/[0-9]+\.meta4' gemeinde.kml | sort -u > gemeinde_urls.txt
fi

if [ ! -f tile_urls.txt ]; then
  echo "Fetching tile URLs..."
  cat gemeinde_urls.txt | shuf | parallel --eta --bar -j 16 '
    curl -s {} | grep -Eo 'https://download1.bayernwolke.de/a/dop20/data/[0-9_]+.tif'
  ' | sort -u > tile_urls.tmp
  mv tile_urls.tmp tile_urls.txt
fi

mkdir -p $DATA/tiles
echo "Downloading tiles..."
cat tile_urls.txt | shuf | parallel --eta --bar -j 16 '
  set -e
  URL={}
  ID=$(basename $URL .tif)
  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0
  curl -so $ID.tif $URL
  gdal_translate --quiet $ID.tif $ID.jp2
  mv $ID.jp2 $DATA/tiles/
  rm $ID.*
'
