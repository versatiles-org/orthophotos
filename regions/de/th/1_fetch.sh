set -e

echo "Fetching tiles..."
mkdir -p $DATA/tiles

# hardcoded sequence for 2024 orthophotos:
seq 550991 551707 | shuf | parallel --eta --bar -j 4 '
  set -e
  ID={.}
  [ -f "$DATA/tiles/{}" ] && exit 0
  curl -sko "{}.tmp" "https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/download.php?type=op&id={}"
  mv "$ID.tmp" "$ID.zip"
  unzip -qo "$ID.zip" -d "$ID"
  rm "$ID.zip"
  mv $ID/*.tif "$DATA/tiles/"
  rm -rf $ID/*
'
