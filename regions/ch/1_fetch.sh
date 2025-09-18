set -e

if [ ! -f index.csv ]; then
  echo "Downloading index.csv"
  curl -so index.json "https://ogd.swisstopo.admin.ch/services/swiseld/services/assets/ch.swisstopo.swissimage-dop10/search?format=image%2Ftiff%3B%20application%3Dgeotiff%3B%20profile%3Dcloud-optimized&resolution=0.1&srid=2056&state=current&csv=true"
  url=$(jq -r '.href' index.json)
  curl -so index.csv "$url"
fi

echo "Downloading tiles..."
mkdir -p $DATA/tiles
cat index.csv | shuf | parallel -j 4 --eta --bar '
  set -e
  url={}
  filename="{/}"

  [ -f "$DATA/tiles/$filename" ] && exit 0
  curl -so "$filename" "$url"
  mv "$filename" "$DATA/tiles/"
'
