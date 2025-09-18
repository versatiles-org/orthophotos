set -e

find tiles -name "*.tif" > $TEMP/list.txt
gdalbuildvrt -addalpha tiles.vrt -input_file_list $TEMP/list.txt
