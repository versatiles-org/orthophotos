set -e

gdalbuildvrt -b 1 -b 2 -b 3 -a_srs "EPSG:3045" tiles_rgb.vrt tiles_rgb/*.jp2
gdalbuildvrt -b 1 -a_srs "EPSG:3045" tiles_alpha.vrt tiles_alpha/*.jp2
gdalbuildvrt -separate tiles.vrt tiles_rgb.vrt tiles_alpha.vrt

xmlstarlet ed -L \
  -s "/VRTDataset/VRTRasterBand[@band='1'][not(ColorInterp)]" -t elem -n ColorInterp -v "Red" \
  -s "/VRTDataset/VRTRasterBand[@band='2'][not(ColorInterp)]" -t elem -n ColorInterp -v "Green" \
  -s "/VRTDataset/VRTRasterBand[@band='3'][not(ColorInterp)]" -t elem -n ColorInterp -v "Blue" \
  -s "/VRTDataset/VRTRasterBand[@band='4'][not(ColorInterp)]" -t elem -n ColorInterp -v "Alpha" \
  tiles.vrt
