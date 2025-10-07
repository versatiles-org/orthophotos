set -e

if [ ! -f index.xml ]; then
  echo "Fetching index.xml..."
  curl -so index.xml "https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/"
fi

cat index.xml | grep -o 'file name=".*\.jp2"' | grep -oE 'dop.*\.jp2' >filenames.txt

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat filenames.txt | shuf | parallel --eta --bar -j 16 '
  set -e

  [ -f "$DATA/tiles/{}" ] && exit 0
  
  curl -so "{}" "https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/{}"
  gdal_translate --quiet -outsize 50% 50% "{}" "{}.tmp.jp2"
  rm "{}"

  mv "{}.tmp.jp2" "$DATA/tiles/{}"
'
