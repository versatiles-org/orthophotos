set -e

curl "https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/" >index.xml
cat index.xml | grep -o 'file name=".*\.jp2"' | grep -oE 'dop.*\.jp2' >filenames.txt

mkdir -p $DATA/tiles
cat filenames.txt | shuf | parallel --eta --bar -j 16 '
  set -e
  [ -f "$DATA/tiles/{}" ] && exit 0
  curl -s "https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/{}" > "{}"
  mv "{}" "$DATA/tiles/"
'
