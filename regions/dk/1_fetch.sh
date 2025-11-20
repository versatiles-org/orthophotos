set -e

source "$(dirname "$0")/../../wms/wms_scrape.sh"

token=$( curl -s https://dataforsyningen.dk/assets/index-CIBmMQ4i.js | grep -E ',cg="([^"]+)",' | sed 's/^.*cg="//; s/".*$//' )

wms_scrape "https://api.dataforsyningen.dk/orto_foraar_DAF?token=${token}" 17 orto_foraar_12_5 black

# alternative:
# user=""; # username for dataforsyningen.dk
# pass=""; # password
# curl -s --list-only "ftps://${user}:${passw}@ftp.dataforsyningen.dk/grundlaeggende_landkortdata/ortofoto/12_5CM/" | while read f; do
# 	curl -s -O "ftps://${user}:${passw}@ftp.dataforsyningen.dk/grundlaeggende_landkortdata/ortofoto/12_5CM/${f}";
# done;
