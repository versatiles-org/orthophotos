set -e

mkdir temp
cd temp

curl "https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/" >index.xml
cat index.xml | grep -o 'file name=".*\.jp2"' | grep -oE 'dop.*\.jp2' >filenames.txt

cat filenames.txt | shuf | parallel --eta --bar -j 16 '[ -f "{}" ] || (curl -s "https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/{}" > "{}.tmp" && mv "{}.tmp" "{}")'

mkdir ../tiles
mv *.jp2 ../tiles/

cd ..
rm -r temp
