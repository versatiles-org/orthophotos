set -e

gdalbuildvrt -addalpha sn.vrt tiles/*.jp2
