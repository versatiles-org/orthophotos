set -e

wget -O index.html --no-check-certificate "https://geobasis-rlp.de/data/dop20rgb/current/jp2/"

cat index.html | htmlq 'div.container table td a' --attribute href >filenames.txt

mkdir -p $DATA/tiles
cat filenames.txt | shuf | parallel --eta --bar -j 4 '
  [ -f "$DATA/tiles/{}" ] && exit 0
  curl -s --insecure "https://geobasis-rlp.de/data/dop20rgb/current/jp2/{}" -o "{}.tmp" && mv "{}.tmp" "$DATA/tiles/{}"
'
