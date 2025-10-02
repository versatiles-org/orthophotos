# Usage:
#   source wms/wms_scrape.sh
#   wms_scrape "https://example.com/wms?" 17 MyLayerName
#   wms_scrape "https://example.com/wms?" 17               # lists layers and exits
#
# Output:
#   Creates ./wms_blocks/<layer>/z<Z>/ with JP2 blocks named: z<Z>_x<TX>_y<TY>_bw<BW>_bh<BH>.jp2
#   (BW=BH is the number of 512px tiles per block side; block size = BW*512 px)
#
wms_scrape() {
  set -euo pipefail

  # ---------- Inputs ----------
  local WMS_URL="${1:-}"; shift || true
  local ZOOM="${1:-}";    shift || true
  local LAYER="${1:-}"    # optional

  if [[ -z "${WMS_URL}" || -z "${ZOOM}" ]]; then
    echo "Usage: wms_scrape <WMS_URL> <ZOOM> [LAYER]" >&2
    return 2
  fi

  # ---------- Dependencies ----------
  for cmd in gdal_translate gdalinfo gdaltransform xmllint parallel awk sed curl; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "Missing dependency: $cmd" >&2; return 2; }
  done

  # ---------- Required environment ----------
  if [[ -z "${DATA:-}" ]]; then
    echo "ERROR: DATA environment variable is not set (e.g., /path/to/data)" >&2
    return 2
  fi
  if [[ -z "${TEMP:-}" ]]; then
    echo "ERROR: TEMP environment variable is not set (e.g., /path/to/local/tmp)" >&2
    return 2
  fi
  mkdir -p "${DATA}/tiles" "${TEMP}"

  # ---------- Config ----------
  # Server-friendliness
  export GDAL_HTTP_MAX_RETRY="${GDAL_HTTP_MAX_RETRY:-5}"
  export GDAL_HTTP_RETRY_DELAY="${GDAL_HTTP_RETRY_DELAY:-1}"
  export CPL_VSIL_CURL_CACHE_SIZE="${CPL_VSIL_CURL_CACHE_SIZE:-16777216}" # 16MB
  export GDAL_HTTP_USERAGENT="${GDAL_HTTP_USERAGENT:-versatiles/orthophotos}"

  # Grid / math constants (Web Mercator)
  local XMIN="-20037508.342789244"
  local XMAX="20037508.342789244"
  local YMIN="-20037508.342789244"
  local YMAX="20037508.342789244"
  local TILE_PX=512                   # downstream canonical tile size
  local CANONICAL_TILE_PX=256         # XYZ math base
  local WMS_VERSION="1.1.1"           # per your choice
  local WMS_CRS_VAL="EPSG:3857"

  # ---------- Working dirs ----------
  local CAPS_XML="${TEMP}/caps.xml"

  # Normalize URL (ensure it ends with ? or & for safe param appending)
  local SEP="&"
  if [[ "$WMS_URL" != *\?* ]]; then SEP="?"; fi

  # ---------- Fetch capabilities ----------
  echo "Fetching GetCapabilities..." >&2
  curl -fsSL "${WMS_URL}${SEP}service=WMS&request=GetCapabilities&version=${WMS_VERSION}" -o "$CAPS_XML"

  # ---------- If no LAYER provided: list and exit ----------
  if [[ -z "${LAYER}" ]]; then
    echo "Select one of the following available layers:"
    local LCOUNT
    LCOUNT=$(xmllint --xpath 'count(//Layer[Name]/Name)' "$CAPS_XML" 2>/dev/null || echo 0)
    LCOUNT=${LCOUNT%.*}
    if (( LCOUNT == 0 )); then
      echo "(none found)"
      return 0
    fi
    xmllint --xpath "//Layer[Name]/Name" "$CAPS_XML" 2>/dev/null \
      | sed -e 's:</Name><Name>:\n:g' -e 's:<Name>::g' -e 's:</Name>::g'
    return 0
  fi

  # ---------- Ensure the layer exists ----------
  local LAYER_COUNT
  LAYER_COUNT=$(xmllint --xpath "count(//Layer[Name='${LAYER}'])" "$CAPS_XML" 2>/dev/null || echo 0)
  LAYER_COUNT=${LAYER_COUNT%.*}
  if (( LAYER_COUNT == 0 )); then
    echo "Layer '${LAYER}' not found in capabilities." >&2
    echo "Hint: list layers by running: wms_scrape \"${WMS_URL}\" ${ZOOM}" >&2
    return 3
  fi

  # ---------- Read MaxWidth/MaxHeight (fallback to defaults 8192) ----------
  # Many WMS 1.1.1 place MaxWidth/MaxHeight under Request/GetMap
  local MAXW MAXH
  MAXW=$(xmllint --xpath "string(//Request/GetMap/MaxWidth)" "$CAPS_XML" 2>/dev/null || true)
  MAXH=$(xmllint --xpath "string(//Request/GetMap/MaxHeight)" "$CAPS_XML" 2>/dev/null || true)
  [[ -z "$MAXW" ]] && MAXW=8192
  [[ -z "$MAXH" ]] && MAXH=8192

  # ---------- Determine layer bbox in EPSG:3857 ----------
  # Prefer BoundingBox[@SRS='EPSG:3857']; else convert LatLonBoundingBox via gdaltransform
  local LXMIN LXMAX LYMIN LYMAX
  LXMIN=$(xmllint --xpath "string(//Layer[Name='${LAYER}']/BoundingBox[@SRS='${WMS_CRS_VAL}']/@minx)" "$CAPS_XML" 2>/dev/null || true)
  LYMIN=$(xmllint --xpath "string(//Layer[Name='${LAYER}']/BoundingBox[@SRS='${WMS_CRS_VAL}']/@miny)" "$CAPS_XML" 2>/dev/null || true)
  LXMAX=$(xmllint --xpath "string(//Layer[Name='${LAYER}']/BoundingBox[@SRS='${WMS_CRS_VAL}']/@maxx)" "$CAPS_XML" 2>/dev/null || true)
  LYMAX=$(xmllint --xpath "string(//Layer[Name='${LAYER}']/BoundingBox[@SRS='${WMS_CRS_VAL}']/@maxy)" "$CAPS_XML" 2>/dev/null || true)

  if [[ -z "$LXMIN" || -z "$LYMIN" || -z "$LXMAX" || -z "$LYMAX" ]]; then
    # Fallback: LatLonBoundingBox (EPSG:4326, lon/lat)
    local LLXMIN LLYMIN LLXMAX LLYMAX
    LLXMIN=$(xmllint --xpath "string(//Layer[Name='${LAYER}']/LatLonBoundingBox/@minx)" "$CAPS_XML" 2>/dev/null || true)
    LLYMIN=$(xmllint --xpath "string(//Layer[Name='${LAYER}']/LatLonBoundingBox/@miny)" "$CAPS_XML" 2>/dev/null || true)
    LLXMAX=$(xmllint --xpath "string(//Layer[Name='${LAYER}']/LatLonBoundingBox/@maxx)" "$CAPS_XML" 2>/dev/null || true)
    LLYMAX=$(xmllint --xpath "string(//Layer[Name='${LAYER}']/LatLonBoundingBox/@maxy)" "$CAPS_XML" 2>/dev/null || true)

    if [[ -z "$LLXMIN" ]]; then
      echo "No EPSG:3857 BoundingBox and no LatLonBoundingBox found for '${LAYER}'." >&2
      return 4
    fi

    # Transform 4 corners to 3857 and compute min/max
    read LXMIN LYMIN <<<"$(printf "%s %s\n" "$LLXMIN" "$LLYMIN" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3857 | awk '{print $1, $2}')"
    read LXMAX LYTMP <<<"$(printf "%s %s\n" "$LLXMAX" "$LLYMIN" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3857 | awk '{print $1, $2}')"
    read XTMP  LYMAX <<<"$(printf "%s %s\n" "$LLXMIN" "$LLYMAX" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3857 | awk '{print $1, $2}')"
    # ensure proper min/max
    # recompute using all four corners for safety
    {
      printf "%s %s\n" "$LLXMIN" "$LLYMIN"
      printf "%s %s\n" "$LLXMAX" "$LLYMIN"
      printf "%s %s\n" "$LLXMIN" "$LLYMAX"
      printf "%s %s\n" "$LLXMAX" "$LLYMAX"
    } | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3857 \
      | awk 'NR==1{minx=maxx=$1; miny=maxy=$2}
             {if($1<minx)minx=$1; if($1>maxx)maxx=$1; if($2<miny)miny=$2; if($2>maxy)maxy=$2}
             END{printf "%.12f %.12f %.12f %.12f\n", minx,miny,maxx,maxy}' \
      | { read LXMIN LYMIN LXMAX LYMAX; echo >/dev/null; }
  fi

  # Clamp to world extent
  awk -v xmin="$XMIN" -v ymin="$YMIN" -v xmax="$XMAX" -v ymax="$YMAX" \
      -v lxmin="$LXMIN" -v lymin="$LYMIN" -v lxmax="$LXMAX" -v lymax="$LYMAX" \
      'BEGIN{
        if(lxmin<xmin) lxmin=xmin; if(lymin<ymin) lymin=ymin;
        if(lxmax>xmax) lxmax=xmax; if(lymax>ymax) lymax=ymax;
        printf "Layer bbox (EPSG:3857): [%.6f, %.6f, %.6f, %.6f]\n", lxmin, lymin, lxmax, lymax > "/dev/stderr";
      }' >/dev/null

  # ---------- Compute block size (square, power of two, <= min(MAXW,MAXH), multiple of 512) ----------
  local LIMIT MIN_LIM
  MIN_LIM=$(( MAXW < MAXH ? MAXW : MAXH ))

  # Largest power of two <= MIN_LIM
  local POW=1
  while (( POW*2 <= MIN_LIM )); do POW=$((POW*2)); done
  # Ensure >= 512 and divisible by 512
  if (( POW < 512 )); then
    echo "MaxWidth/MaxHeight too small (min=${MIN_LIM}) to fit a 512px-based block." >&2
    return 5
  fi
  # reduce to nearest multiple of 512 (power-of-two already is, if >=512)
  local BLOCK_PX="${POW}"

  local BW=$(( BLOCK_PX / TILE_PX ))  # tiles per side in 512-tiling
  local BH="$BW"
  echo "Chosen block size: ${BLOCK_PX}x${BLOCK_PX} px  =>  ${BW}x${BH} tiles of 512px" >&2

  # ---------- Write WMS XML (GDAL WMS driver) ----------
  local WMS_XML="${TEMP}/wms.xml"
  gdal_translate "WMS:$WMS_URL?Layers=Raster&SRS=${WMS_CRS_VAL}&ImageFormat=image/png&Transparent=TRUE&BandsCount=4&UserAgent=${GDAL_HTTP_USERAGENT}" -of wms "$WMS_XML"

  # ---------- Enumerate blocks (CSV: id,x0,y0,x1,y1) ----------
  local OUT_TILES_DIR="${DATA}/tiles"
  mkdir -p "$OUT_TILES_DIR"
  local BLOCKS_CSV="${TEMP}/blocks.csv"

  awk -v xmin="$XMIN" -v xmax="$XMAX" -v ymin="$YMIN" -v ymax="$YMAX" \
      -v lxmin="$LXMIN" -v lxmax="$LXMAX" -v lymin="$LYMIN" -v lymax="$LYMAX" \
      -v z="$ZOOM" -v tile_px="$TILE_PX" -v base_px="$CANONICAL_TILE_PX" \
      -v bw="$BW" -v bh="$BH" \
      'function pow2(n){return (2^n)} \
       function res(z){return ( (xmax - xmin) / (base_px * (2^z)) )} \
       function floor(v){return (v>=0)?int(v):int(v)-((v!=int(v))?1:0)} \
       function ceil(v){return (v==int(v))?v:int(v)+1} \
       BEGIN{
         r = res(z)
         # tile indices (512px) covering layer bbox
         txmin = floor((lxmin -  xmin) / (tile_px * r))
         tymin = floor(( ymax - lymax) / (tile_px * r))
         txmax = ceil ((lxmax -  xmin) / (tile_px * r)) - 1
         tymax = ceil (( ymax - lymin) / (tile_px * r)) - 1

         # expand to block-aligned ranges (multiples of bw/bh)
         tx0 = (txmin >= 0) ? ( (txmin / bw)*bw ) : ( -ceil((-txmin)/bw)*bw )
         ty0 = (tymin >= 0) ? ( (tymin / bh)*bh ) : ( -ceil((-tymin)/bh)*bh )
         # expand upward
         tx1 = (((txmax+1 + bw-1)/bw)*bw)-1
         ty1 = (((tymax+1 + bh-1)/bh)*bh)-1

         # iterate by blocks
         for(tx=tx0; tx<=tx1; tx+=bw){
           for(ty=ty0; ty<=ty1; ty+=bh){
             x0 = xmin + tx     * tile_px * r
             y1 = ymax - ty     * tile_px * r
             x1 = xmin + (tx+bw)* tile_px * r
             y0 = ymax - (ty+bh)* tile_px * r

             # CSV columns:
             # 1:id, 2:x0, 3:y0, 4:x1, 5:y1
             id = sprintf("%d_%d", tx, ty)
             printf "%s,%.12f,%.12f,%.12f,%.12f\n", id, x0, y0, x1, y1
           }
         }
       }' > "$BLOCKS_CSV"

  echo "Planned blocks: $(wc -l < "$BLOCKS_CSV")" >&2

  # ---------- Parallel download & convert (PNG -> lossless JP2 RGBA) ----------
  # Fetch from WMS as PNG into a temporary GeoTIFF (to ensure proper georeferencing)
  # then convert to JP2, then move to final location.
  # Note: -projwin expects ULx ULy LRx LRy (x0 y1 x1 y0)
  w=$((BW*TILE_PX));
  h=$((BH*TILE_PX));
  export DATA WMS_XML w h  # for parallel
  cat "$BLOCKS_CSV" | shuf | parallel --eta --bar --colsep ',' --jobs 1 --delay 1 --retries 3 --halt soon,fail=5 '
    set -e
    id="{1}"; x0="{2}"; y0="{3}"; x1="{4}"; y1="{5}";

    [[ -f "$DATA/tiles/$id.jp2" ]] && exit 0

    gdal_translate --quiet "$WMS_XML" "$id.tif" \
      -projwin "$x0" "$y1" "$x1" "$y0" \
      -projwin_srs EPSG:3857 \
      -outsize "$w" "$h" \
      -of GTiff \
      -co COMPRESS=DEFLATE -co PREDICTOR=2 -co ALPHA=YES

    gdal_translate --quiet "$id.tif" "$id.jp2"

    mv "$id.jp2" "$DATA/tiles/" 2> >(grep -v "failed to preserve ownership" >&2)
    rm $id*
  '
}
