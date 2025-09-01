set -e


curl -so kreis.kml "https://geodaten.bayern.de/odd/a/dop20/meta/kml/kreis.kml"
sed -nE 's/.*href=&#34;(.*?\.meta4)&#34;.*/\1/p' kreis.kml > kreise_urls.txt

cat kreise_urls.txt | shuf | parallel --eta --bar -j 4 --lb 'curl -s {}' > meta_files.txt
sed -nE 's/.*<url>(https:\/\/download2.bayernwolke.de\/a\/dop20\/data\/.*?\.tif)<\/url>.*/\1/p' meta_files.txt | sort -u > dop20_urls.txt

mkdir -p $DATA/tiles
cat dop20_urls.txt | shuf | parallel --eta --bar -j 16 '
  set -e
  URL={}
  ID={/.}
  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0
  curl -so $ID.tif $URL
  gdal_translate $ID.tif $ID.jp2 -co QUALITY=100
  mv $ID.jp2 $DATA/tiles/
  rm $ID.tif
'
