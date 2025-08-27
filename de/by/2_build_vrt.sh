set -e

gdalbuildvrt -addalpha bayern.vrt tiles/*.tif
