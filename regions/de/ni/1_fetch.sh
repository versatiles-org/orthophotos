set -e

if [ ! -f lgln-opengeodata-dop20.geojson ]; then
  echo "Fetching GeoJSON..."
  curl -s -o lgln-opengeodata-dop20.geojson "https://arcgis-geojson.s3.eu-de.cloud-object-storage.appdomain.cloud/dop20/lgln-opengeodata-dop20.geojson"
fi

jq -rc '.features[].properties | [.tile_id,.Aktualitaet,.rgb] | @tsv' lgln-opengeodata-dop20.geojson | sort -r | uniq -w 9 | cut -f 3 > urls.txt

echo "Fetching tiles..."
mkdir -p $DATA/tiles
cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e

  ID={/}

  [ -f "$DATA/tiles/$ID" ] && exit 0
  
  curl -so "$ID.tmp" {}
  mv "$ID.tmp" "$DATA/tiles/$ID"
'
