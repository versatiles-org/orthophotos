set -e

source "$(dirname "$0")/../../wms/wms_scrape.sh"

wms_scrape "http://www.geoportal.lt/arcgis/services/NZT/ORT10LT_Web_Mercator_102100/MapServer/WMSServer" 17 0
