# http://mapy.geoportal.gov.pl/wss/service/ATOM/httpauth/download/?fileId=ae73c0632c4bd6407dd03ea9998a180f&name=polska_oi_2021.zip
# https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WCS/TrueOrto?Request=GetCapabilities&service=WCS
# https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/TrueOrtho
# https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution
# https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution
set -e

source "$(dirname "$0")/../../wms/wms_scrape.sh"

wms_scrape "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution" 17 Raster black
