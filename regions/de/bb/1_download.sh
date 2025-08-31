set -e

mkdir -p temp
cd temp

curl "https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/" >index.html
cat index.html | htmlq '#indexlist a' --attribute href | grep -oE '^.*\.zip' >filenames.txt

cat filenames.txt | shuf | parallel --eta --bar -j 4 '
  if [ ! -f "{}" ]; then
    curl -s "https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/{}" -o "{}.tmp" && mv "{}.tmp" "{}"
  fi
'

ls -1 *.zip | parallel --eta --bar -j 16 'unzip -qo {} && rm {}'

mkdir -p ../tiles
find . -type f \( -name "*.jpg" -o -name "*.jgw" \) | parallel --eta --bar mv {} ../tiles/

cd ..
rm -r temp
