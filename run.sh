set -e

cd "$(dirname "$0")"
source config.env

REQUIRED_CMDS=(7z curl gdal_translate gdalbuildvrt gdalwarp parallel unzip versatiles wget xmlstarlet yq)
for cmd in "${REQUIRED_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "❌ Missing command: $cmd" >&2
    MISSING=1
  fi
done

if [ "${MISSING:-0}" -eq 1 ]; then
  echo "Some required commands are missing." >&2
  exit 1
fi

NAME=$1
TASK=$2

# error if not set
if [ -z "$NAME" ]; then
  echo "Usage: $0 <name> <task>"
  exit 1
fi

# error if not set
if [ -z "$TASK" ]; then
  echo "Usage: $0 <name> <task>"
  exit 1
fi

# ensure format is "../.." or ".."
if [[ ! "$NAME" =~ ^[a-z][a-z](/[a-z][a-z])?$ ]]; then
  echo "Error: NAME must be in the format 'folder/file'"
  exit 1
fi

PROJ="$(pwd)/regions/$NAME"
DATA="$dir_data/$NAME"
TEMP="$dir_temp/$NAME"

mkdir -p "$DATA"
mkdir -p "$TEMP"

case "$TASK" in
  "1_download")
    rsync -ahtWe "ssh -p $rsync_port -i $rsync_id" --info progress2 "$rsync_host:orthophoto/$NAME/" "$DATA/"
    ;;
  "2_fetch")
    cd "$TEMP"
    DATA=$DATA TEMP=$TEMP PROJ=$PROJ bash -c "$PROJ/1_fetch.sh"
    ;;
  "3_vrt")
    cd "$DATA"
    DATA=$DATA TEMP=$TEMP PROJ=$PROJ bash -c "$PROJ/2_build_vrt.sh"
    ;;
  "4_preview")
    cd "$DATA"
    sources=$(yq -r '.data[]' "$PROJ/status.yml")
    for source in $sources; do
      gdalwarp -tr 200 200 -t_srs EPSG:3857 -r nearest -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite -co QUALITY=10 $DATA/$source.vrt $TEMP/$source.jp2
      mv $TEMP/$source.jp2 $DATA/$source.jp2
    done
    ;;
  "5_convert")
    sources=$(yq -r '.data[]' "$PROJ/status.yml")
    for source in $sources; do
      echo "from_gdal_raster filename=\"$DATA/$source.vrt\" level_max=17 | raster_overview | raster_format format=webp quality=30 speed=0" > "$TEMP/$source.vpl"
      versatiles convert "$TEMP/$source.vpl" "$DATA/$source.versatiles"
    done
    ;;
  "6_upload")
    rsync -ahtWe "ssh -p $rsync_port -i $rsync_id" --info progress2 "$DATA/" "$rsync_host:orthophoto/$NAME/" "$DATA/"
    ;;
  *)
    echo "Error: Unknown task '$TASK'"
    exit 1
    ;;
esac

rm -rf "$TEMP"
