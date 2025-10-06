#!/bin/bash

# orthophotos/run.sh — orchestrates the pipeline for downloading, processing, and uploading orthophotos
#
# USAGE
#   ./run.sh <name> <task>
#
# ARGUMENTS
#   <name>   Region identifier in the form "cc" or "cc/ss" (two-letter country, optional two-letter subdivision), e.g. "de/bw".
#   <task>   One or more tasks to run. Can be a single step (e.g. "3" or "upload"),
#            a comma-separated list (e.g. "1,2,3"), or ranges (e.g. "1-3,5").
#
# TASKS
#   0 | download   – rsync pull existing data from remote
#   1 | fetch       – fetch new source data into $TEMP
#   2 | vrt         – build VRTs
#   3 | preview     – create preview TIFFs
#   4 | convert     – convert to .versatiles
#   5 | upload      – rsync push to remote (excludes tiles/ unless NAME starts with de/ or fr)
#   6 | delete      – delete local data for the region
#   all            – runs the full pipeline in the predefined order (0 1 5 2 5 3 5 4 5 6)
#
# EXAMPLES
#   ./run.sh de/bw 1                     # run step 1 (fetch)
#   ./run.sh fr   2-4                    # run steps 2,3,4
#   ./run.sh de/bw 1,2,3                 # run steps 1,2,3
#   ./run.sh de/bw all                   # run the full pipeline
#   ./run.sh --help                      # show help
#
# NOTES
#   • Required tools are auto-checked. See REQUIRED_CMDS below.
#   • Tasks support comma lists and numeric ranges. Order is preserved left-to-right.
#   • Temporary data lives in $dir_temp/<name>; output in $dir_data/<name>.

set -e

show_help() {
  cat <<'EOF'
Usage: ./run.sh <name> <task>

<name>  Region identifier: cc or cc/ss (e.g., de/bw)
<task>  One or more tasks: a single step (e.g., 3 or upload),
        a comma list (e.g., 1,2,3), and/or ranges (e.g., 1-3,5)

Tasks:
  0 | download   rsync pull existing data from remote
  1 | fetch      fetch new source data
  2 | vrt        build VRTs
  3 | preview    create preview TIFFs
  4 | convert    convert to .versatiles
  5 | upload     rsync push to remote (excludes tiles/ unless NAME starts with de/ or fr)
  6 | delete     delete local data for the region
  all            run full pipeline: 0 1 5 2 5 3 5 4 5 6

Examples:
  ./run.sh de/bw 1
  ./run.sh fr 2-4
  ./run.sh de/bw 1,2,3
  ./run.sh de/bw all

Environment:
  dir_data, dir_temp, rsync_host, rsync_port, rsync_id must be set in config.env
EOF
}

cd "$(dirname "$0")"
source config.env

# early help
if [[ "$1" == "-h" || "$1" == "--help" || "$1" == "help" ]]; then
  show_help
  exit 0
fi

REQUIRED_CMDS=(7z curl gdal_translate gdalbuildvrt gdalwarp htmlq jq parallel unzip versatiles wget xmlstarlet yq)
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
  echo "❌ Missing <name>" >&2
  show_help
  exit 1
fi

# error if not set
if [ -z "$TASK" ]; then
  echo "❌ Missing <task>" >&2
  show_help
  exit 1
fi

# ensure format is "cc" or "cc/ss" (two-letter country, optional two-letter subdivision)
if [[ ! "$NAME" =~ ^[a-z][a-z](/[a-z][a-z])?$ ]]; then
  echo "❌ Error: <name> must be 'cc' or 'cc/ss' (e.g., 'de' or 'de/bw')" >&2
  show_help
  exit 1
fi

PROJ="$(pwd)/regions/$NAME"
DATA="$dir_data/$NAME"
TEMP="$dir_temp/$NAME"

mkdir -p "$DATA"

IFS=',' read -ra RAW_TASKS <<< "$TASK"
TASKS=()

for t in "${RAW_TASKS[@]}"; do
  if [[ $t =~ ^([0-9]+)-([0-9]+)$ ]]; then
    start=${BASH_REMATCH[1]}
    end=${BASH_REMATCH[2]}
    if (( start <= end )); then
      for ((i=start; i<=end; i++)); do TASKS+=("$i"); done
    else
      for ((i=start; i>=end; i--)); do TASKS+=("$i"); done
    fi
  elif [[ $t =~ ^(all|ALL)$ ]]; then
    TASKS+=(0 1 5 2 5 3 5 4 5 6)
  else
    TASKS+=("$t")
  fi
done

echo "→ Running tasks: ${TASKS[*]}"

for TASK in "${TASKS[@]}"; do
  case $TASK in
    0|0_download|download)
      echo "Downloading existing data from server..."
      rsync -ahtWe "ssh -p $rsync_port -i $rsync_id" --info progress2 "$rsync_host:orthophoto/$NAME/" "$DATA/"
      ;;
    1|1_fetch|fetch)
      echo "Fetching new data..."
      mkdir -p "$TEMP"
      cd "$TEMP"
      DATA=$DATA TEMP=$TEMP PROJ=$PROJ bash -c "$PROJ/1_fetch.sh" && rm -rf "$TEMP"
      ;;
    2|2_vrt|vrt)
      echo "Building VRT..."
      ulimit -n 8192
      mkdir -p "$TEMP"
      cd "$DATA"
      DATA=$DATA TEMP=$TEMP PROJ=$PROJ bash -c "$PROJ/2_build_vrt.sh" && rm -rf "$TEMP"
      ;;
    3|3_preview|preview)
      echo "Creating preview images..."
      ulimit -n 8192
      cd "$DATA"
      sources=$(yq -r '.entries[]' "$PROJ/status.yml")
      for source in $sources; do
        mkdir -p "$TEMP"
        gdalwarp \
          -tr 200 200 -r nearest \
          -overwrite -multi -wo "NUM_THREADS=4" \
          -co COMPRESS=ZSTD -co PREDICTOR=2 \
          $DATA/$source.vrt $TEMP/$source.tif
        mv $TEMP/$source.tif $DATA/
      done
      ;;
    4|4_convert|convert)
      echo "Converting data..."
      ulimit -n 8192
      sources=$(yq -r '.entries[]' "$PROJ/status.yml")
      for source in $sources; do
        #[ -f "$DATA/$source.versatiles" ] && continue
        mkdir -p "$TEMP"
        echo "from_gdal_raster filename=\"$DATA/$source.vrt\" level_max=17 max_reuse_gdal=8 | raster_overview | raster_format format=webp quality=\"70,16:50,17:30\" speed=0" > "$TEMP/$source.vpl"
        versatiles convert "$TEMP/$source.vpl" "$TEMP/$source.versatiles"
        # versatiles convert $TEMP/$source.vpl $TEMP/$source.mbtiles
        # versatiles convert $TEMP/$source.mbtiles $TEMP/$source.versatiles
        mv $TEMP/$source.versatiles $DATA/
        rm -f $TEMP/$source.mbtiles
      done
      ;;
    5|5_upload|upload)
      echo "Uploading data to server..."

      EXCLUDES=()
      #if [[ "$NAME" != fr ]]; then
        EXCLUDES=(--exclude=tiles/ --exclude=tiles_*/)
      #fi

      rsync -ahtWe "ssh -p $rsync_port -i $rsync_id" --info=progress2 "${EXCLUDES[@]}" "$DATA/" "$rsync_host:orthophoto/$NAME/"
    ;;
    6|6_delete|delete)
      echo "Deleting local data..."
      rm -rf "$DATA"
      rm -rf "$TEMP"
      ;;
    *)
      echo "Error: Unknown task '$TASK'"
      exit 1
      ;;
  esac
done
