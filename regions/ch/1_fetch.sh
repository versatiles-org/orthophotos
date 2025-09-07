set -e

if [ ! -f index.csv ]; then
  echo "Downloading index.csv"
  curl -so index.csv "https://ogd.swisstopo.admin.ch/resources/ch.swisstopo.swissimage-dop10-FolIi7E8.csv"
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
