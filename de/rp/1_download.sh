set -e

mkdir -p temp
cd temp

wget -O index.html --no-check-certificate "https://geobasis-rlp.de/data/dop20rgb/current/jp2/"

cat index.html | htmlq 'div.container table td a' --attribute href >filenames.txt

mkdir -p ../tiles
cat filenames.txt | shuf | parallel --eta --bar -j 4 '
  if [ ! -f "../tiles/{}" ]; then
    curl -s --insecure "https://geobasis-rlp.de/data/dop20rgb/current/jp2/{}" -o "{}.tmp" && mv "{}.tmp" "../tiles/{}"
  fi
'

cd ..
rm -r temp
