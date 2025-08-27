set -e

mkdir -p tiles
mkdir -p temp
cd temp

wget -O atom.xml "https://www.geodaten-mv.de/dienste/dop20_atom?type=dataset&id=f94d17fa-b29b-41f7-a4b8-6e10f1aae38e"

grep -oP 'href="[^"]+"' atom.xml | grep 'dop20rgbi_.*\.tif"' | cut -d'"' -f2 | sed 's/amp;//g' > urls.txt

tempdir=$(mktemp -d)
cat urls.txt | shuf | parallel --eta --bar -j 8 '
  set -e
  fname={}
  fname="${fname##*file=}"   # drop everything up to "file="
  fname="${fname%%&*}"     # drop any trailing &... if present
  if [ ! -f "../tiles/$fname" ]; then
    curl -s {} -o "$tempdir/$fname.0.tif"
    gdal_translate -q "$tempdir/$fname.0.tif" "$tempdir/$fname.1.tif" -co COMPRESS=ZSTD -co PREDICTOR=2
    mv "$tempdir/$fname.1.tif" "../tiles/$fname" 2>/dev/null
    rm "$tempdir/$fname.0.tif"
  fi
'

cd ..
rm -r temp
