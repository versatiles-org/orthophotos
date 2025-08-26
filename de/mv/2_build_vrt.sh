set -e

gdalbuildvrt -addalpha mv.vrt tiles/*.tif
