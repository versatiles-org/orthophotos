set -e

curl -s \
  "https://owsproxy.lgl-bw.de/owsproxy/wfs/WFS_LGL-BW_ATKIS_DOP_20_Bildflugkacheln_Aktualitaet?request=GetFeature&service=WFS&version=2.0.0&outputFormat=json&typeNames=verm:v_dop_20_bildflugkacheln" \
  > list.json

jq -rc '.features[] | .properties.dop_kachel | "dop20rgb_"+.[0:2]+"_"+.[2:5]+"_"+.[5:9]+"_2_bw.zip"' list.json \
  | uniq > filenames.txt

# Ensure DATA is exported so parallel shells can see it
export DATA
mkdir -p "$DATA/tiles"

# ---------- define & export the inner worker ----------
file_to_jp2() {
  set -e
  local in="$1"
  # robust: strip the final extension, even with multiple dots
  local base="$(basename -- "$in" | sed 's/\.[^.]*$//')"

  gdal_translate -q "$in" "$base.jp2" -co QUALITY=100
  mv "$base.jp2" "$DATA/tiles/$base.jp2"
  rm -f "$in"
}
export -f file_to_jp2
# -----------------------------------------------------

# Outer parallel
shuf < filenames.txt | parallel --eta --bar -j 4 '
  set -e
  NAME={}
  ID={.}

  # Skip if already processed
  [ -f "$DATA/tiles/$ID.txt" ] && exit 0

  # Download atomically
  curl -fL -s "https://opengeodata.lgl-bw.de/data/dop20/$NAME" -o "$ID.tmp"
  mv "$ID.tmp" "$NAME"

  # Unpack into its own directory
  unzip -qo "$NAME" -d "$ID"
  rm -f "$NAME"

  # Find TIFFs safely and process with inner parallel (no {} in the template)
  find "$ID" -type f -name "*.tif" | parallel --env file_to_jp2 -j 4 file_to_jp2

  # Mark done and clean up
  touch "$DATA/tiles/$ID.txt"
  rm -rf "$ID"
'