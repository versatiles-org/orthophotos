set -e

if [ ! -f index.html ]; then
  echo "Fetching index.html..."
  curl -s "https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/" >index.html
fi
cat index.html | htmlq '#indexlist a' --attribute href | grep -oE '^.*\.zip' >filenames.txt

mkdir -p $DATA/tiles
cat filenames.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  ID={.}
  [ -f "$DATA/tiles/$ID.jpg" ] && exit 0
  curl -s "https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/$ID.zip" -o "$ID.tmp"
  mv "$ID.tmp" "$ID.zip"
  unzip -qo "$ID.zip" -d "$ID"
  rm "$ID.zip"
  mv $ID/**/*.jpg "$DATA/tiles/"
  mv $ID/**/*.jgw "$DATA/tiles/"
'
