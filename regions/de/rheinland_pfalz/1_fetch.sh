set -e

if [ ! -f index.html ]; then
  echo "Fetching index.html..."
  curl -sko index.html "https://geobasis-rlp.de/data/dop20rgb/current/jp2/"
fi

cat index.html | htmlq 'div.container table td a' --attribute href >filenames.txt

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat filenames.txt | shuf | parallel --eta --bar -j 4 '
  set -e

  [ -f "$DATA/tiles/{}" ] && exit 0
  
  curl -sko "{}.tmp" "https://geobasis-rlp.de/data/dop20rgb/current/jp2/{}"
  mv "{}.tmp" "$DATA/tiles/{}"
'
