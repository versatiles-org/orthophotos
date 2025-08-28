set -e

# 2024/2025 does not contain an alpha channel!

mkdir -p temp
cd temp
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/Mitte.zip"
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/Nord.zip"
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/Nordost.zip"
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/Nordwest.zip"
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/Ost.zip"
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/Sued.zip"
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/Suedost.zip"
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/Suedwest.zip"
wget "https://fbinter.stadt-berlin.de/fb/atom/DOP/dop20true_rgbi_2024/West.zip"
ls -1 *.zip | parallel --eta --bar unzip {}

mkdir -p tiles
find . -type f -name "*.jp2" | parallel --eta --bar mv {} ../tiles/

cd ..
rm -r temp
