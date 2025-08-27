set -e

gdalbuildvrt -addalpha sl.vrt tiles/*.jp2
