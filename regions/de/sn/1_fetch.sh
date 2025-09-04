set -e

if [ ! -f atom.xml ]; then
  echo "Fetching atom.xml..."
  curl -so atom.xml "https://geodownload.sachsen.de/inspire/oi_atom/Dataset_oi_tif.xml"
fi

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:link' -v '@href' -n atom.xml | sed 's/amp;//g' > urls.txt

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  URL={}
  ID=$(echo $URL | sed -E "s/.*files=([^&]+)_tiff\.zip/\1/")

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0

  curl -so "$ID.zip" "$URL"
  unzip -q "$ID.zip"

  gdal_translate --quiet -of JP2OpenJPEG "$ID.tif" "$ID.jp2" -co QUALITY=100

  mv "$ID.jp2" "$DATA/tiles/"

  find . -name "$ID.*" -delete
'
