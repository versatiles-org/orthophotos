[![Code coverage](https://codecov.io/gh/versatiles-org/orthophotos/branch/main/graph/badge.svg)](https://app.codecov.io/github/versatiles-org/orthophotos)
[![CI status](https://img.shields.io/github/actions/workflow/status/versatiles-org/orthophotos/ci.yml)](https://github.com/versatiles-org/orthophotos/actions/workflows/ci.yml)

# Orthophotos

This repository contains scripts and tools to fetch, process, and serve raster tiles generated from orthophotos. It provides automated workflows for downloading raw orthophoto data from European national agencies, processing it into `*.versatiles` containers, and preparing a server to preview them.

## Contents

- **`/src/regions/`**: TypeScript region definitions — each file defines metadata and a pipeline for fetching + converting orthophoto data.
- **`/src/`**: TypeScript source code for the pipeline, utilities, status checking, and server preparation.
- **`/web/`**: HTML and related files used to run a test server that previews all processed orthophoto data.
- **`/data/`**: NUTS TopoJSON reference data for region matching.

## Setup

### Prerequisites

- Node.js >= 22
- External CLI tools: `7z`, `curl`, `gdal_translate`, `gdalbuildvrt`, `ssh`, `unzip`, `versatiles`

Install CLI dependencies (macOS or Linux):

```bash
./install-dependencies.sh
```

Install Node.js dependencies:

```bash
npm install
```

### Configuration

Create a `config.env` file:

```bash
dir_data=/mnt/volume/        # Directory for storing large datasets and final outputs
dir_temp=/root/temp/          # Directory used for temporary files during processing
ssh_host=your.ssh.host        # Hostname for remote storage
ssh_port=22                   # SSH port
ssh_id=/root/.ssh/id           # Path to SSH private key
ssh_dir=/path/to/remote/data   # Remote base directory for uploads
```

## Running the Pipeline

```bash
./run.sh <region> <task>
```

### Tasks

| #   | Name   | Description                                            |
| --- | ------ | ------------------------------------------------------ |
| 1   | fetch  | Download source data + per-file versatiles mosaic tile |
| 2   | merge  | Merge .versatiles files + upload to remote             |
| 3   | delete | Remove local data and temp directories                 |

Task spec supports: numbers (`2`), names (`fetch`), ranges (`1-3`), comma lists (`fetch,2-3`), `all` (full pipeline).

### Examples

```bash
./run.sh de/berlin 1         # Fetch orthophoto data for Berlin
./run.sh de/berlin 1-2       # Fetch and merge
./run.sh de/berlin all       # Full pipeline: fetch, merge, delete
```

## Preview Server

The preview server shows all processed orthophoto data using VersaTiles. It generates a `.vpl` (VersaTiles Pipeline Language) file that references orthophoto and satellite containers via SFTP, with GeoJSON masks for clean region clipping.

```bash
npm run server
```

The demo is publicly accessible at [versatiles.org/satellite_demo/](https://versatiles.org/satellite_demo/).

## Development

```bash
npm run check          # Lint + format check + typecheck + tests
npm run lint           # ESLint
npm run test           # Run tests (vitest)
npm run test:coverage  # Run tests with coverage
npm run typecheck      # TypeScript type checking
npm run format         # Auto-format with Prettier
```

### Dependency Graph

<!--- This chapter is generated automatically --->

```mermaid
---
config:
  layout: elk
---
flowchart TB

subgraph 0["src"]
1["check-remote.ts"]
subgraph 2["lib"]
3["remote-listing.ts"]
5["command.ts"]
6["delay.ts"]
7["progress.ts"]
8["retry.ts"]
B["region-api.ts"]
F["array.ts"]
G["constants.ts"]
H["fs.ts"]
I["gdal.ts"]
J["geometry.ts"]
K["pipeline.ts"]
L["process_tiles.ts"]
M["validators.ts"]
N["rate-limit.ts"]
O["remote-zip.ts"]
P["versatiles.ts"]
Q["wms.ts"]
R["xml.ts"]
W["framework.ts"]
end
4["config.ts"]
subgraph 9["regions"]
A["*.ts (27 files)"]
subgraph S["de"]
T["*.ts (17 files)"]
end
subgraph U["fr"]
V["*.ts (4 files)"]
end
end
subgraph C["status"]
D["geojson.ts"]
E["ascii.ts"]
11["index.ts"]
12["html.ts"]
13["regions.ts"]
1D["status.ts"]
end
X["preview.ts"]
subgraph Y["server"]
Z["frontend.ts"]
10["vpl.ts"]
end
14["publish-world-local.ts"]
subgraph 15["run"]
16["commands.ts"]
19["args.ts"]
1A["tasks.constants.ts"]
1B["tasks.ts"]
end
17["publish-world.ts"]
18["run.ts"]
1C["status-check.ts"]
end
1-->3
1-->A
3-->4
3-->5
5-->6
5-->7
5-->8
8-->6
A-->T
A-->V
A-->B
B-->4
B-->D
B-->F
B-->5
B-->G
B-->6
B-->H
B-->I
B-->J
B-->K
B-->L
B-->7
B-->N
B-->O
B-->8
B-->M
B-->P
B-->Q
B-->R
D-->E
H-->5
I-->5
I-->H
K-->5
K-->7
L-->F
L-->H
L-->K
L-->M
M-->5
M-->8
N-->6
N-->8
P-->5
P-->G
P-->H
Q-->5
Q-->R
T-->B
V-->B
X-->4
X-->5
X-->Z
X-->10
Z-->5
10-->4
10-->A
10-->11
11-->D
11-->12
11-->13
14-->4
14-->5
14-->H
14-->16
14-->10
16-->4
16-->5
17-->4
17-->5
17-->16
17-->10
18-->4
18-->5
18-->A
18-->19
18-->16
18-->1B
19-->1A
1B-->4
1B-->H
1B-->P
1B-->A
1B-->16
1B-->1A
1C-->A
1C-->11

class 0,2,9,S,U,C,Y,15 subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
