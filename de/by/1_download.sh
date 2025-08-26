set -e

mkdir tiles
cd tiles

curl -so kreis.kml "https://geodaten.bayern.de/odd/a/dop20/meta/kml/kreis.kml"

sed -nE 's/.*href=&#34;(.*?\.meta4)&#34;.*/\1/p' kreis.kml > kreise_urls.txt

cat kreise_urls.txt | shuf | parallel --eta --bar -j 4 --lb 'curl -s {}' > meta_files.txt

sed -nE 's/.*<url>(https:\/\/download2.bayernwolke.de\/a\/dop20\/data\/.*?\.tif)<\/url>.*/\1/p' meta_files.txt | sort -u > dop20_urls.txt

cat dop20_urls.txt | shuf | parallel --eta --bar -j 16 '
	[ -f {/} ] && exit 0
	curl -so {/}.1tmp.tif {}
	gdal_translate --quiet -ovr NONE -of GTiff -co COMPRESS=WEBP -co WEBP_LEVEL=90 {/}.1tmp.tif {/}.2tmp.tif
	mv {/}.2tmp.tif {/}
	rm {/}*
'
