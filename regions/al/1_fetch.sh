set -e

source "$(dirname "$0")/../../wms/wms_scrape.sh"

wms_scrape "https://geoportal.asig.gov.al/service/wms" 17 "orthophoto_2015:OrthoImagery_20cm" white
# "ortofoto_2018:Ortofoto_2018" white
