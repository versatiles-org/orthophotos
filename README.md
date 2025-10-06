# Orthophotos

This repository contains scripts and tools to fetch, process, and serve raster tiles generated from orthophotos. It provides automated workflows for downloading raw orthophoto data, processing it into `*.versatiles` containers, and preparing a server to preview them.

> [!WARNING]
> This project is a jumble of experimental, loosely structured glue code. Please watch your step and be careful.

## Contents

- **`/regions/`**: Bash scripts to download and generate raster tiles for various countries and regions.
- **`/src/`**: Deno scripts for data validation, metadata processing, overview generation, and other processing tasks.
- **`/web/`**: HTML and related files used to run a test server that previews all processed orthophoto data.

## Add `config.env`

Create a `config.env` file to configure paths and connection settings:

```bash
dir_data=/mnt/volume/      # Directory for storing large datasets and final outputs.
dir_temp=/root/temp/       # Directory used for temporary files during processing.
rsync_host=your.rsync.host # Hostname or IP address for long-term storage via rsync.
rsync_port=23              # Port number for the rsync connection.
rsync_id=/root/.ssh/id     # Path to the SSH private key used for rsync authentication.
```

## Running `run.sh`

The `run.sh` script orchestrates the main processing tasks, including downloading data, generating tiles, and uploading results. Usage:

```bash
./run.sh [task] [options]
```

### Common tasks:

- `0`/`download` download existing data from the long-term storage 
- `1`/`fetch` fetch new raw orthophoto data
- `2`/`vrt` build a vrt file
- `3`/`preview` build a preview image
- `4`/`convert` convert to VersaTiles tiles
- `5`/`upload` upload to the long-term storage 
- `6`/`delete` delete all local files

### Examples

```bash
./run.sh de/by download
./run.sh fr 0-2,5,4,5
```

Refer to the script’s help output for additional options and detailed usage.

## Preview Server

The preview server is a VersaTiles server showing all the processed orthophoto data. It works by downloading all `.versatiles` containers from long-term storage and using Deno to build a `.vpl` (VersaTiles Pipeline Language) file. This `.vpl` file defines a raster source onto which satellite data is overlaid with the processed orthophotos. The server is publicly accessible at [icarus.versatiles.org](https://icarus.versatiles.org/). Its primary purpose is to facilitate debugging and quality control by displaying orthophotos at all zoom levels, which makes it easier to identify problems and defects. The final product, which will be available at [download.versatiles.org](https://download.versatiles.org/), will display orthophotos at the appropriate zoom levels, beginning at zoom levels 11 or 12.

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
