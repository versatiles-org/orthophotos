set -e

mkdir -p tiles
mkdir -p temp
cd temp

curl -s "https://data.bev.gv.at/geonetwork/srv/atom/describe/service?uuid=7f047345-4ebf-45cd-8900-6edf50a84638" >atom.xml
xmlstarlet sel -N a="http://www.w3.org/2005/Atom" \
  -t -m "//a:entry[a:title[contains(.,'Digitales Orthophoto Farbe (DOP)')]]/a:id" \
  -v '.' -n atom.xml | sed 's/amp;//g' > urls.txt

cat urls.txt | shuf | parallel --eta --bar -j 4 '
  set -e
  url={}
  id=$(echo "$url" | grep -oE "........-....-....-....-............")
  if [ ! -f "../tiles/$id.jp2" ]; then
    curl -s "$url" -o "$id.xml"
    tif=$(xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t -m "//a:entry//a:id" -v "." -n $id.xml)
    curl -s "$tif" -o "$id.tif"
  
    mv "$id.tif" "../tiles/"
    rm "$id*"
  fi
'

ls -1 *.zip | parallel --eta --bar -j 16 'unzip -qo {} && rm {}'

cd ..
rm -r temp
