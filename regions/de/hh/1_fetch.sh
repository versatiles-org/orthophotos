set -e

# https://suche.transparenz.hamburg.de/dataset/luftbilder-hamburg-dop-zeitreihe-belaubt1

wget "https://daten-hamburg.de/geographie_geologie_geobasisdaten/digitale_orthophotos/DOP_belaubt/DOP2024_belaubt_Hamburg_Altona.zip"
wget "https://daten-hamburg.de/geographie_geologie_geobasisdaten/digitale_orthophotos/DOP_belaubt/DOP2024_belaubt_Hamburg_Bergedorf.zip"
wget "https://daten-hamburg.de/geographie_geologie_geobasisdaten/digitale_orthophotos/DOP_belaubt/DOP2024_belaubt_Hamburg_Eimsbuettel.zip"
wget "https://daten-hamburg.de/geographie_geologie_geobasisdaten/digitale_orthophotos/DOP_belaubt/DOP2024_belaubt_Hamburg_Hamburg-Mitte.zip"
wget "https://daten-hamburg.de/geographie_geologie_geobasisdaten/digitale_orthophotos/DOP_belaubt/DOP2024_belaubt_Hamburg_Hamburg-Nord.zip"
wget "https://daten-hamburg.de/geographie_geologie_geobasisdaten/digitale_orthophotos/DOP_belaubt/DOP2024_belaubt_Hamburg_Harburg.zip"
wget "https://daten-hamburg.de/geographie_geologie_geobasisdaten/digitale_orthophotos/DOP_belaubt/DOP2024_belaubt_Hamburg_Wandsbek.zip"

ls -1 *.zip | parallel --eta --bar 'unzip {} && rm {}'

mkdir -p $DATA/tiles
find . -type f -name "*.tif" -exec mv {} $DATA/tiles/ \;
