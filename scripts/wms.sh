#!/usr/bin/env bash
set -euo pipefail

# -------- parameters --------
URL=""          # e.g. https://server/wms?
LAYERS=""
STYLES=""
FORMAT="image/jpeg"   # or image/png
BBOX3857=""     # xmin,ymin,xmax,ymax in EPSG:3857
OUTDIR="chunks"
CHUNK_PX=4096
Z=17            # target zoom for alignment (Web Mercator)
# ----------------------------

die(){ echo "Error: $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing required: $1"; }

# parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2;;
    --layers) LAYERS="$2"; shift 2;;
    --styles) STYLES="$2"; shift 2;;
    --format) FORMAT="$2"; shift 2;;
    --bbox3857) BBOX3857="$2"; shift 2;;
    --outdir) OUTDIR="$2"; shift 2;;
    --chunk-px) CHUNK_PX="$2"; shift 2;;
    --z) Z="$2"; shift 2;;
    *) die "Unknown arg: $1";;
  esac
done

[[ -n "$URL" && -n "$LAYERS" && -n "$BBOX3857" ]] || die "Required: --url, --layers, --bbox3857 xmin,ymin,xmax,ymax (EPSG:3857)"

need gdalwarp
need gdalinfo

mkdir -p "$OUTDIR"

# Constants for Web Mercator
# Global mercator extent used by XYZ: [-ORIGIN, ORIGIN]^2
ORIGIN=20037508.342789244

# Pixel resolution (meters/pixel) for 256px tiles at zoom Z.
# res0 = 2*ORIGIN / 256; resZ = res0 / 2^Z
res0=$(awk -v o="$ORIGIN" 'BEGIN{printf("%.12f", (2*o)/256)}')
RES=$(awk -v r0="$res0" -v z="$Z" 'BEGIN{printf("%.12f", r0/(2^z))}')

# A 4096×4096 chunk width/height in meters at zoom Z:
STEP_M=$(awk -v res="$RES" -v px="$CHUNK_PX" 'BEGIN{printf("%.6f", res*px)}')

# Input bbox
IFS=',' read -r XMIN YMIN XMAX YMAX <<< "$BBOX3857"

# Snap bbox to z=Z pixel grid so chunks align with 512 tiles after
snap_down () { # snap coordinate down to pixel grid
  awk -v c="$1" -v res="$RES" -v origin="$ORIGIN" '
    BEGIN{
      # shift origin to [0, 2*ORIGIN], snap to pixel, shift back
      px = int((c + origin)/res);
      printf("%.6f", px*res - origin);
    }'
}
snap_up () { # snap coordinate up to pixel grid
  awk -v c="$1" -v res="$RES" -v origin="$ORIGIN" '
    BEGIN{
      px = int(((c + origin)+res-1e-9)/res); # ceil with tolerance
      printf("%.6f", px*res - origin);
    }'
}

SXMIN=$(snap_down "$XMIN")
SYMIN=$(snap_down "$YMIN")
SXMAX=$(snap_up   "$XMAX")
SYMAX=$(snap_up   "$YMAX")

# Create a minimal GDAL WMS XML (temporary)
WMS_XML="$(mktemp -t gdal_wms_XXXXXX.xml)"
cat > "$WMS_XML" <<EOF
<GDAL_WMS>
  <Service name="WMS">
    <Version>1.3.0</Version>
    <ServerUrl>${URL}</ServerUrl>
    <Layers>${LAYERS}</Layers>
    <Styles>${STYLES}</Styles>
    <ImageFormat>${FORMAT}</ImageFormat>
    <Transparent>true</Transparent>
  </Service>
  <DataWindow>
    <SRS>EPSG:3857</SRS>
    <UpperLeftX>-20037508.342789244</UpperLeftX>
    <UpperLeftY>20037508.342789244</UpperLeftY>
    <LowerRightX>20037508.342789244</LowerRightX>
    <LowerRightY>-20037508.342789244</LowerRightY>
  </DataWindow>
  <Projection>EPSG:3857</Projection>
  <BlockSizeX>512</BlockSizeX>
  <BlockSizeY>512</BlockSizeY>
  <BandsCount>3</BandsCount>
  <Cache />
</GDAL_WMS>
EOF

# If PNG with alpha, switch BandsCount to 4
if [[ "$FORMAT" == "image/png" ]]; then
  sed -i.bak 's/<BandsCount>3<\/BandsCount>/<BandsCount>4<\/BandsCount>/' "$WMS_XML" || true
fi

echo "[i] Using RES=${RES} m/px at z=${Z}, chunk meters=${STEP_M}"
echo "[i] Snapped bbox: ${SXMIN},${SYMIN},${SXMAX},${SYMAX}"

# Iterate the grid in STEP_M increments
# We keep pixel size exactly 4096×4096 via -ts, so the output
# aligns to the z=17 pixel grid.
y="$SYMAX"
row=0
while awk -v y="$y" -v ymin="$SYMIN" 'BEGIN{exit !(y>ymin-1e-6)}'; do
  x="$SXMIN"
  col=0
  while awk -v x="$x" -v xmax="$SXMAX" 'BEGIN{exit !(x<xmax-1e-6)}'; do
    x1=$(awk -v x="$x" -v s="$STEP_M" 'BEGIN{printf("%.6f", x+s)}')
    y1=$(awk -v y="$y" -v s="$STEP_M" 'BEGIN{printf("%.6f", y-s)}')

    out="${OUTDIR}/z${Z}_r${row}_c${col}.tif"

    echo "[i] Chunk r${row} c${col} -> ${out}"
    gdalwarp -overwrite -of GTiff \
      -t_srs EPSG:3857 \
      -te "$x" "$y1" "$x1" "$y" \
      -te_srs EPSG:3857 \
      -ts "$CHUNK_PX" "$CHUNK_PX" \
      -r bilinear \
      -co TILED=YES -co COMPRESS=DEFLATE -co PREDICTOR=2 \
      "$WMS_XML" "$out"

    x="$x1"
    col=$((col+1))
  done
  y="$y1"
  row=$((row+1))
done

echo "[✓] Done. Chunks in: $OUTDIR"
echo "[i] Each 4096×4096 chunk = 8×8 tiles of 512×512 at z=$Z."