set -e

cwd="$(dirname "$0")"
sources=$(yq -r '.data[]' "$cwd/status.yml")

for source in $sources; do
  echo "Processing $source"
  gdalbuildvrt -srcnodata "255 255 255" -b 1 -b 2 -b 3 -addalpha $source.vrt $source/*.jp2
done
