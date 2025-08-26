set -e

mkdir -p temp
mkdir -p tiles
cd temp

curl -s "https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20.xml" >atom.xml
cat atom.xml | grep -o 'href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_dop20rgbi.*\.xml"' | grep -oE 'dop20rgbi[^\.]*' > ids.txt

cat ids.txt | shuf | parallel --eta --bar -j 1 '
  set -e
  name={}
  if [ ! -f "../tiles/$name.jp2" ]; then
    curl -s "https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_$name.xml" > "$name.xml"
    url=$(cat $name.xml | grep -oE "https://udp.gdi-sh.de/fmedatastreaming.*?INTERPOLATION=cubic" | head -n1 | sed -r "s/amp\;//")
    curl -s "$url" -o "$name.tif"
    gdal_translate --quiet -of JP2OpenJPEG "$name.tif" "$name.jp2" -co QUALITY=100
    mv "$name.jp2" "../tiles/"
    find . -name "$name.*" -delete
  fi
'

cd ..
rm -r temp
