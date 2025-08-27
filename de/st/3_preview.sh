set -e

gdal_translate -tr 100 100 -r nearest st.vrt st.tif
