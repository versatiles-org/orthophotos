set -e

curl -s "https://geodownload.sachsen.de/inspire/oi_atom/Dataset_oi_tif.xml" >atom.xml

xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:link' -v '@href' -n atom.xml | sed 's/amp;//g' > urls.txt

mkdir -p $DATA/tiles
cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  url={}
  name=$(echo $url | sed -E "s/.*files=([^&]+)_tiff\.zip/\1/")
  [ -f "$DATA/tiles/$name.jp2" ] && exit 0
  wget -q "$url" -O "$name.zip"
  unzip -q "$name.zip"
  gdal_translate --quiet -of JP2OpenJPEG "$name.tif" "$name.jp2" -co QUALITY=100
  mv "$name.jp2" "$DATA/tiles/"
  find . -name "$name*" -delete
'
