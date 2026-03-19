# That looks like the main entry point for fetching Ortoimagery data for Poland.
# Each year does not cover the whole country, so we need to fetch each year separately and then merge them together.
# Always using the latest year available for each grid cell.
# http://mapy.geoportal.gov.pl/wss/service/ATOM/httpauth/atom/OI?spatial_dataset_identifier_code=OI&spatial_dataset_identifier_namespace=PL.PZGiK.203


# Old stuff
# http://mapy.geoportal.gov.pl/wss/service/ATOM/httpauth/download/?fileId=ae73c0632c4bd6407dd03ea9998a180f&name=polska_oi_2021.zip
# https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WCS/TrueOrto?Request=GetCapabilities&service=WCS
# https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/TrueOrtho
# https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution
# https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution
# set -e
# source "$(dirname "$0")/../../wms/wms_scrape.sh"
# wms_scrape "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution" 17 Raster black
# http://mapy.geoportal.gov.pl/wss/service/ATOM/httpauth/atom/OI?spatial_dataset_identifier_code=OI&spatial_dataset_identifier_namespace=PL.PZGiK.203
# http://mapy.geoportal.gov.pl/wss/service/ATOM/httpauth/download/?fileId=ae73c0632c4bd6407dd03ea9998a180f&name=polska_oi_2021.zip