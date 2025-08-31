set -e

curl -s "https://geodatenportal.sachsen-anhalt.de/arcgisinspire/rest/directories/web/INSPIRE_ALKIS/ALKIS_OI_DOP20_MapServer/datasetoi.xml" >atom.xml

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:link' -v '@href' -n atom.xml | sed 's/amp;//g' > urls.txt
cat urls.txt | grep -oE '[0-9]*' > ids.txt

mkdir -p $DATA/tiles
cat ids.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  id={}
  url="https://www.geodatenportal.sachsen-anhalt.de/gfds_webshare/sec-download/LVermGeo/DOP20/${id}.tif"
  [ -f "$DATA/tiles/${id}.jp2" ] && exit 0
  wget -q "$url" -O "${id}.tif"
  gdal_translate --quiet -of JP2OpenJPEG "${id}.tif" "${id}.jp2" -co QUALITY=100
  mv "${id}.jp2" "$DATA/tiles/"
  find . -name "${id}.*" -delete
'
