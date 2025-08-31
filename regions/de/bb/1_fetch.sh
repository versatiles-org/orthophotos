set -e

curl "https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/" >index.html
cat index.html | htmlq '#indexlist a' --attribute href | grep -oE '^.*\.zip' >filenames.txt

cat filenames.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  [ -f "{}" ] && exit 0
  curl -s "https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/{}" -o "{}.tmp"
  mv "{}.tmp" "{}"
'

ls -1 *.zip | parallel --eta --bar -j 16 'unzip -qo {} && rm {}'

mkdir -p $DATA/tiles
find . -type f \( -name "*.jpg" -o -name "*.jgw" \) | parallel --eta --bar mv {} $DATA/tiles/
