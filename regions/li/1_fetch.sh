set -e

echo "Downloading only one big tile..."
mkdir -p $DATA/tiles
wget -O $DATA/tiles/image.tif "https://service.geo.llv.li/atom/data/e77da96f-bc1c-4317-8c2f-81310812c798.tif"
