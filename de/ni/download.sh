# niedersachsen

mkdir temp
mkdir tiles
cd temp

wget "https://arcgis-geojson.s3.eu-de.cloud-object-storage.appdomain.cloud/dop20/lgln-opengeodata-dop20.geojson"

jq -rc '.features[].properties | [.tile_id,.Aktualitaet,.rgb] | @tsv' lgln-opengeodata-dop20.geojson | sort -r | uniq -w 9 | cut -f 3 > urls.txt

cat urls.txt | shuf | parallel --eta --bar -j 4 '[ -f "{/}" ] || (curl -so "{/}.tmp" {} && mv "{/}.tmp" "{/}")'

gdalbuildvrt de_niedersachsen.vrt *.tif
gdal_translate -of COG -co BIGTIFF=YES -co COMPRESS=WEBP -co QUALITY=100 -co NUM_THREADS=ALL_CPUS de_niedersachsen.vrt ../de_niedersachsen.tif

cd ..
rm -r temp
