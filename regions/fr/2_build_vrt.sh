set -e

cwd="$(dirname "$0")"
sources=$(yq -r '.data[]' "$cwd/status.yml")

for name in $sources; do
  echo "Processing $name"
  gdalbuildvrt -addalpha $name.vrt $name/*.jp2
done
