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

Before rebuilding regions for a release, work through [docs/building-a-release.md](docs/building-a-release.md).

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
1["build-quality-zones.ts"]
subgraph 2["lib"]
3["index.ts"]
B["array.ts"]
C["command.ts"]
D["delay.ts"]
E["progress.ts"]
F["retry.ts"]
G["config.ts"]
H["constants.ts"]
I["framework.ts"]
J["fs.ts"]
K["gdal.ts"]
L["geometry.ts"]
M["pipeline.ts"]
N["process_tiles.ts"]
O["validators.ts"]
P["rate-limit.ts"]
Q["remote-hashes.ts"]
R["remote-listing.ts"]
S["remote-zip.ts"]
T["versatiles.ts"]
U["white-mask.ts"]
V["wms.ts"]
W["xml.ts"]
end
subgraph 4["status"]
5["index.ts"]
6["geojson.ts"]
7["ascii.ts"]
8["html.ts"]
9["regions.ts"]
A["style.ts"]
1N["status.ts"]
end
subgraph X["quality-zones"]
Y["index.ts"]
Z["build.ts"]
10["progress.ts"]
11["steps.ts"]
end
12["check-remote.ts"]
subgraph 13["regions"]
subgraph 14["**"]
15["*.ts (49 files)"]
end
end
16["preview.ts"]
subgraph 17["server"]
18["index.ts"]
19["frontend.ts"]
1A["vpl.ts"]
end
1B["publish-hashes.ts"]
1C["publish-world-local.ts"]
subgraph 1D["run"]
1E["index.ts"]
1F["args.ts"]
1G["tasks.constants.ts"]
1H["commands.ts"]
1I["regions.ts"]
1J["tasks.ts"]
end
1K["publish-world.ts"]
1L["run.ts"]
1M["status-check.ts"]
end
1-->3
1-->Y
3-->5
3-->B
3-->C
3-->G
3-->H
3-->D
3-->I
3-->J
3-->K
3-->L
3-->M
3-->N
3-->E
3-->P
3-->Q
3-->R
3-->S
3-->F
3-->O
3-->T
3-->U
3-->V
3-->W
5-->6
5-->8
5-->9
5-->A
6-->7
A-->3
C-->D
C-->E
C-->F
F-->D
I-->H
J-->C
K-->C
K-->J
M-->C
M-->E
N-->B
N-->I
N-->J
N-->M
N-->O
O-->C
O-->F
P-->D
P-->F
Q-->C
Q-->G
R-->C
R-->G
T-->C
T-->H
T-->J
U-->C
U-->J
V-->C
V-->W
Y-->Z
Z-->3
Z-->10
Z-->11
12-->3
12-->15
15-->3
16-->3
16-->18
18-->19
18-->1A
19-->3
1A-->3
1A-->15
1A-->5
1B-->3
1C-->3
1C-->1E
1C-->18
1E-->1F
1E-->1H
1E-->1I
1E-->1J
1F-->1G
1H-->3
1J-->3
1J-->15
1J-->1H
1J-->1G
1K-->3
1K-->1E
1K-->18
1L-->3
1L-->15
1L-->1E
1M-->15
1M-->5

class 0,2,4,X,13,14,17,1D subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
