set -e

wget "https://gdi2.geo.bremen.de/inspire/download/DOP/data/DOP10_RGB_JPG_HB.zip"
wget "https://gdi2.geo.bremen.de/inspire/download/DOP/data/DOP10_RGB_JPG_BHV.zip"

unzip DOP10_RGB_JPG_HB.zip -d files_hb
unzip DOP10_RGB_JPG_BHV.zip -d files_bhv
rm *.zip

unzip files_hb/DOP10_RGB_JPG_HB_2025_03.zip -d files_hb
rm files_hb/DOP10_RGB_JPG_HB_2025_03.zip

unzip files_bhv/DOP10_RGB_JPG_BHV_2025_03.zip -d files_bhv
rm files_bhv/DOP10_RGB_JPG_BHV_2025_03.zip

mkdir -p $DATA/tiles_hb
mkdir -p $DATA/tiles_bhv
find files_hb -type f -name "*.jpg" | parallel --eta --bar mv {} $DATA/tiles_hb/
find files_hb -type f -name "*.wld" | parallel --eta --bar mv {} $DATA/tiles_hb/{.}.jgw
find files_bhv -type f -name "*.tif" | parallel --eta --bar mv {} $DATA/tiles_bhv/
