set -e

wget -O lgln-opengeodata-dop20.geojson "https://arcgis-geojson.s3.eu-de.cloud-object-storage.appdomain.cloud/dop20/lgln-opengeodata-dop20.geojson"

jq -rc '.features[].properties | [.tile_id,.Aktualitaet,.rgb] | @tsv' lgln-opengeodata-dop20.geojson | sort -r | uniq -w 9 | cut -f 3 > urls.txt

mkdir -p $DATA/tiles
cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  name={/}
  [ -f "$DATA/tiles/$name" ] && exit 0
  curl -so "$name.tmp" {}
  mv "$name.tmp" "$DATA/tiles/$name"
'
