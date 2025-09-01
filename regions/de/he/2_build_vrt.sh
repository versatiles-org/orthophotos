set -e

find tiles -name "*.jp2" > $TEMP/jp2_list.txt
gdalbuildvrt -addalpha tiles.vrt -input_file_list $TEMP/jp2_list.txt
