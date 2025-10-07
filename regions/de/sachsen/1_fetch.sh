set -e

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"

# Source: https://www.geodaten.sachsen.de/batch-download-4719.html
cp "$SCRIPT_DIR/urls.txt" "."

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  
  URL={}
  ID=$(echo $URL | sed -E "s/.*\/(dop20rgb_.*?)_2_sn_tiff\.zip/\1/")

  [ -f "$DATA/tiles/$ID.jp2" ] && exit 0

  curl -so "$ID.zip" "$URL"
  unzip -oq "$ID.zip"
  rm "$ID.zip"

  gdal raster edit --nodata 255 "${ID}_2_sn.tif"
  gdal_translate --quiet -b 1 -b 2 -b 3 -b mask -colorinterp_4 alpha "${ID}_2_sn.tif" "$ID.jp2"

  mv "$ID.jp2" "$DATA/tiles/"

  find . -name "$ID*" -delete
'
