set -e

mkdir -p temp
mkdir -p tiles
cd temp

wget -O lgln-opengeodata-dop20.geojson "https://arcgis-geojson.s3.eu-de.cloud-object-storage.appdomain.cloud/dop20/lgln-opengeodata-dop20.geojson"

jq -rc '.features[].properties | [.tile_id,.Aktualitaet,.rgb] | @tsv' lgln-opengeodata-dop20.geojson | sort -r | uniq -w 9 | cut -f 3 > urls.txt

cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  name={/}
  if [ ! -f "../tiles/$name" ]; then
    curl -so "$name.tmp" {}
    mv "$name.tmp" "../tiles/$name"
  fi
'

cd ..
rm -r temp
