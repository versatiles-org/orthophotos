set -e

cwd="$(dirname "$0")"
sources=$(yq -r '.data[]' "$cwd/status.yml")

for source in $sources; do
  echo "Processing $source"
  gdalbuildvrt -addalpha $source.vrt $source/*.jp2
done
