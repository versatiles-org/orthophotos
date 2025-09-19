set -e

RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ ! -f index.html ]; then
  echo -e "${GREEN}Fetching index.html...${NC}"
  curl -so index.html "https://geoservices.ign.fr/bdortho"
fi

sed -n '/id="bd-ortho-dernière-édition"/,/id="bd-ortho-anciennes-éditions"/p' index.html > downloads.html

size=$(stat -c%s downloads.html)
if [ $size -lt 254000 ] || [ $size -gt 256000 ]; then
  echo -e "${RED}The section with the download links in index.html should be around 255kB, but is ${size}B.${NC}"
  exit 1
fi

grep -oP 'href="\K[^"]+' downloads.html > urls.txt

url_count=$(wc -l < urls.txt)
pos=0

grep -oP 'download/BDORTHO/\K[^/]+' urls.txt | sort -u > groups.txt

while IFS= read -r group; do
  echo -e "${GREEN}Processing $group: $pos/$url_count${NC}"
  n=$(grep -c "$group" urls.txt)
  pos=$((pos + n))

  projection=$(echo $group | cut -d '_' -f 5)
  district=$(echo $group | cut -d '_' -f 6)
  tiles_dir="$DATA/tiles_$projection/"
  export tiles_dir
  mkdir -p "$tiles_dir"

  district_status="$tiles_dir/$district.check"
  [ -f "$district_status" ] && continue

  folder="$TEMP/$group"
  export folder

  mkdir -p "$folder"

  echo -e "${YELLOW}Downloading $n files${NC}"
  grep "$group" urls.txt | parallel --eta --bar -j 4 '
    set -e
    FILE_URL={}
    FILE_NAME="$folder/${FILE_URL##*/}"
    [ -f "$FILE_NAME" ] && exit 0
    curl -so "$FILE_NAME.tmp" "$FILE_URL"
    mv "$FILE_NAME.tmp" "$FILE_NAME"
  '

  main_file=$(find "$folder" \( -name "*.7z" -o -name "*.7z.001" \) | sort | head -n 1)
  [ -z "$main_file" ] && { echo -e "${RED}No .7z file found in $folder${NC}"; exit 1; }

  echo -e "${YELLOW}Extracting $main_file${NC}"
  7z e -o"$folder" -bb0 -aoa "$main_file"

  echo -e "${YELLOW}Converting JP2 files${NC}"
  mkdir -p "$folder/tmp"
  files=$(find "$folder" -name "*.jp2")
  echo "$files" | parallel --eta --bar -j 67% '
    set -e
    [ -f "$tiles_dir/{/}" ] && exit 0
    gdal_translate --quiet {} "$folder/tmp/{/}"
    mv "$folder/tmp/{/}" "$tiles_dir/{/}" 2> >(grep -v "failed to preserve ownership" >&2)
    rm {}
  '

  echo -e "${YELLOW}Cleaning up${NC}"
  rm -rf "$folder"
  echo $files > $district_status
done < groups.txt
