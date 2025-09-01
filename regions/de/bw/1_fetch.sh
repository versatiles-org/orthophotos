set -e

curl "https://owsproxy.lgl-bw.de/owsproxy/wfs/WFS_LGL-BW_ATKIS_DOP_20_Bildflugkacheln_Aktualitaet?request=GetFeature&service=WFS&version=2.0.0&outputFormat=json&typeNames=verm:v_dop_20_bildflugkacheln" > list.json
jq -rc '.features[] | .properties.dop_kachel | "dop20rgb_"+.[0:2]+"_"+.[2:5]+"_"+.[5:9]+"_2_bw.zip"' list.json | uniq > filenames.txt

cat filenames.txt | shuf | parallel --eta --bar -j 4 '
  if [ ! -f "{}" ]; then
    curl -s "https://opengeodata.lgl-bw.de/data/dop20/{}" -o "{}.tmp" && mv "{}.tmp" "{}"
  fi
'

find . -type f -name "*.zip" -size +1k > zip_filenames.txt
cat zip_filenames.txt | shuf | parallel --eta --bar -j 4 'unzip -qo {} && rm {}'

mkdir -p $DATA/tiles
find . -type f -name "*.tif" | parallel --eta --bar '
  set -e
  [ -f "$DATA/tiles/{}" ] && exit 0
  gdal_translate -q "{}" "{.}.jp2" -co QUALITY=100 -co REVERSIBLE=YES
  mv "{.}.jp2" "$DATA/tiles/{}"
  rm "{}"
'
