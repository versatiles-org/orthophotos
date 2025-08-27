# https://geodownload.sachsen.de/inspire/oi_atom/Dataset_oi_tif.xml


set -e

mkdir -p temp
mkdir -p tiles
cd temp

curl -s "https://geodownload.sachsen.de/inspire/oi_atom/Dataset_oi_tif.xml" >atom.xml

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:link' -v '@href' -n atom.xml | sed 's/amp;//g' > urls.txt

cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  url={}
  name=$(echo $url | sed -E "s/.*files=([^&]+)_tiff\.zip/\1/")
  if [ ! -f "../tiles/$name.jp2" ]; then
    wget -q "$url" -O "$name.zip"
    unzip -q "$name.zip"
    gdal_translate --quiet -of JP2OpenJPEG "$name.tif" "$name.jp2" -co QUALITY=100
    mv "$name.jp2" "../tiles/"
    find . -name "$name*" -delete
  fi
'

cd ..
rm -r temp
