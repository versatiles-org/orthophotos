set -e

gdalbuildvrt -addalpha rp.vrt tiles/*.jp2
