set -e

source "$(dirname "$0")/../../wms/wms_scrape.sh"

token=$( curl -s https://dataforsyningen.dk/assets/index-CIBmMQ4i.js | grep -E ',cg="([^"]+)",' | sed 's/^.*cg="//; s/".*$//' )

# wms_scrape "https://api.dataforsyningen.dk/orto_foraar_DAF?crs=EPSG:4326&dpiMode=7&featureCount=10&format=image/png&layers=orto_foraar_12_5&tilePixelRatio=0&url=https://api.dataforsyningen.dk/orto_foraar_DAF&token=$token" 17 Raster black
wms_scrape "https://api.dataforsyningen.dk/orto_foraar_DAF?token=${token}" 17 orto_foraar_12_5 black
