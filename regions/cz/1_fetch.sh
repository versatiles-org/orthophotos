set -e

curl -s "https://atom.cuzk.gov.cz/OI/OI.xml" >atom.xml
xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:id' -v '.' -n atom.xml > urls.txt

mkdir -p $DATA/tiles

cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  url_xml={}
  id=$(echo $url_xml | grep -oE "[0-9]+_[0-9]+")
  if [ ! -f "$DATA/tiles/$id.jp2" ]; then
    curl -s "$url_xml" > "$id.xml"
    url_zip=$(xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m '//a:entry//a:id' -v '.' -n $id.xml | head -n 1)
    curl -s "$url_zip" > "$id.zip"
    unzip -qod "$id" "$id.zip"
    rm "$id.zip"
    mv "$id/$id.j2w" "$DATA/tiles/"
    mv "$id/$id.jp2" "$DATA/tiles/"
    rm -r "$id"
    rm $id.*
  fi
'
