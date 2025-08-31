set -e

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

CWD=$(pwd)
DATA="$dir_data/$NAME"
TEMP="$dir_temp/$NAME"

mkdir -p "$DATA"
mkdir -p "$TEMP"

case "$TASK" in
  "download")
    rsync -ahtWe "ssh -p $rsync_port -i $rsync_id" --info progress2 "$rsync_host:orthophoto/$NAME/" "$DATA/"
    ;;
  "fetch")
    cd "$TEMP"
    bash -c "$CWD/regions/$NAME/1_fetch.sh"
    ;;
  "vrt")
    cd "$DATA"
    bash -c "$CWD/regions/$NAME/2_build_vrt.sh"
    ;;
  "preview")
    sources=$(yq -r '.data[]' "$CWD/regions/$NAME/status.yml")
    for source in $sources; do
      gdalwarp -tr 100 100 -r nearest -multi -wo "NUM_THREADS=ALL_CPUS" -overwrite $DATA/$source.vrt $CWD/regions/$NAME/$source.jp2
    done
    ;;
  "convert")
    sources=$(yq -r '.data[]' "$CWD/regions/$NAME/status.yml")
    for source in $sources; do
      versatiles convert $DATA/$source.vpl $DATA/$source.versatiles
    done
    ;;
  "upload")
    rsync -ahtWe "ssh -p $rsync_port -i $rsync_id" --info progress2 "$DATA/" "$rsync_host:orthophoto/$NAME/" "$DATA/"
    ;;
  *)
    echo "Error: Unknown task '$TASK'"
    exit 1
    ;;
esac
