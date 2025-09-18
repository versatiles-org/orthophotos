# Orthophotos

This repo is a collection of scripts to generate raster tiles from orthoimagery.

It consists of:
- bash scripts to download and generate raster tiles for various countries (folder `/regions/`),
- Deno scripts to check all data, process metadata, generate overviews, ... (folder `/src/`)
- HTML used for a test server showing a preview of all processed data. 

## Add `config.env`

```bash
dir_data=/mnt/volume/ # for big data
dir_temp=/root/temp/  # for temporary data
rsync_host=...        # longterm storage
rsync_port=23
rsync_id=/root/.ssh/id
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
