set -e

if [ ! -f index.html ]; then
  echo "Fetching index.html..."
  curl -so index.html "https://geoservices.ign.fr/bdortho"
fi

sed -n '/id="bd-ortho-dernière-édition"/,/id="bd-ortho-anciennes-éditions"/p' index.html > downloads.html

size=$(stat -c%s downloads.html)
if [ $size -lt 254000 ] || [ $size -gt 256000 ]; then
  echo "The section with the download links in index.html should be around 255kB, but is ${size}B."
  exit 1
fi

grep -oP 'href="\K[^"]+' downloads.html > urls.txt

url_count=$(wc -l < urls.txt)
pos=0

grep -oP 'download/BDORTHO/\K[^/]+' urls.txt | sort -u > groups.txt

while IFS= read -r group; do
  echo "Processing $group: $pos/$url_count"
  n=$(grep -c "$group" urls.txt)
  pos=$((pos + n))

  projection=$(echo $group | cut -d '_' -f 5)
  district=$(echo $group | cut -d '_' -f 6)
  tiles_dir="$DATA/tiles_$projection/"
  mkdir -p "$tiles_dir"

  district_status="$tiles_dir/$district.check"
  [ -f "$district_status" ] && continue

  folder="$TEMP/$group"
  mkdir -p "$folder"
  export folder

  echo "Downloading $n files"
  grep "$group" urls.txt | parallel --eta --bar -j 4 '
    set -e
    FILE_URL={}
    FILE_NAME="$folder/${FILE_URL##*/}"
    [ -f "$FILE_NAME" ] && exit 0
    curl -so "$FILE_NAME.tmp" "$FILE_URL"
    mv "$FILE_NAME.tmp" "$FILE_NAME"
  '

  main_file=$(find "$folder" \( -name "*.7z" -o -name "*.7z.001" \) | sort | head -n 1)
  [ -z "$main_file" ] && { echo "No .7z file found in $folder"; exit 1; }

  echo "Extracting $main_file"
  7z e -o"$folder" -bb0 -aoa "$main_file"

  echo "Moving JP2 files to …/tiles_$projection/"
  export tiles_dir
  find "$folder" -name "*.jp2" | parallel --eta --bar 'mv {} "$tiles_dir"'

  echo "Cleaning up"
  rm -rf "$folder"
  touch "$district_status"
done < groups.txt
