set -e

gdalbuildvrt -addalpha sh.vrt tiles/*.jp2
