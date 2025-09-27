set -e

curl -s "https://atom.cuzk.gov.cz/OI/OI.xml" >atom.xml
xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:id' -v '.' -n atom.xml > urls.txt

mkdir -p $DATA/tiles_rgb
mkdir -p $DATA/tiles_alpha

cat urls.txt | shuf | parallel --eta --bar -j 60% '
  set -e
  url_xml={}
  id=$(echo $url_xml | grep -oE "[0-9]+_[0-9]+")
  if [ ! -f "$DATA/tiles_rgb/$id.jp2" ]; then
    curl -s "$url_xml" > "$id.xml"
    url_zip=$(xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:id' -v '.' -n $id.xml | head -n 1)
    curl -s "$url_zip" > "$id.zip"
    unzip -qod "$id" "$id.zip"
    rm "$id.zip"
    mv "$id/$id.j2w" "$DATA/tiles_rgb/"
    mv "$id/$id.jp2" "$DATA/tiles_rgb/"
    rm -r "$id"
    rm $id.*
  fi

  if [ ! -f "$DATA/tiles_alpha/$id.jp2" ]; then
    gdal raster calc \
      -i "A=$DATA/tiles_rgb/$id.jp2" \
      --calc="255*(((A[1]<254)+(A[2]<254)+(A[3]<254))>0)" \
      --overwrite \
      --datatype=Byte \
      -o "$id.jp2"
      
    mv "$id.jp2" "$DATA/tiles_alpha/"
  fi
'
