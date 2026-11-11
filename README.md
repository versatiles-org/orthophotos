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
- External CLI tools: `7z`, `curl`, `gdal_translate`, `gdalbuildvrt`, `osmium`, `ssh`, `unzip`, `versatiles`

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
I["fs.ts"]
J["gdal.ts"]
K["geometry.ts"]
L["pipeline.ts"]
M["process_tiles.ts"]
N["validators.ts"]
O["rate-limit.ts"]
P["remote-hashes.ts"]
Q["remote-listing.ts"]
R["remote-zip.ts"]
S["versatiles.ts"]
T["wms.ts"]
U["xml.ts"]
14["framework.ts"]
end
subgraph 4["status"]
5["index.ts"]
6["geojson.ts"]
7["ascii.ts"]
8["html.ts"]
9["regions.ts"]
A["style.ts"]
1L["status.ts"]
end
subgraph V["quality-zones"]
W["index.ts"]
X["build.ts"]
Y["progress.ts"]
Z["steps.ts"]
end
10["check-remote.ts"]
subgraph 11["regions"]
subgraph 12["**"]
13["*.ts (49 files)"]
end
end
15["preview.ts"]
subgraph 16["server"]
17["index.ts"]
18["frontend.ts"]
19["vpl.ts"]
end
1A["publish-hashes.ts"]
1B["publish-world-local.ts"]
subgraph 1C["run"]
1D["index.ts"]
1E["args.ts"]
1F["tasks.constants.ts"]
1G["commands.ts"]
1H["tasks.ts"]
end
1I["publish-world.ts"]
1J["run.ts"]
1K["status-check.ts"]
end
1-->3
1-->W
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
3-->E
3-->O
3-->P
3-->Q
3-->R
3-->F
3-->N
3-->S
3-->T
3-->U
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
I-->C
J-->C
J-->I
L-->C
L-->E
M-->B
M-->I
M-->L
M-->N
N-->C
N-->F
O-->D
O-->F
P-->C
P-->G
Q-->C
Q-->G
S-->C
S-->H
S-->I
T-->C
T-->U
W-->X
W-->Z
X-->3
X-->Y
X-->Z
10-->3
10-->13
13-->3
15-->3
15-->17
17-->18
17-->19
18-->3
19-->3
19-->13
19-->5
1A-->3
1B-->3
1B-->1D
1B-->17
1D-->1E
1D-->1G
1D-->1H
1E-->1F
1G-->3
1H-->3
1H-->13
1H-->1G
1H-->1F
1I-->3
1I-->1D
1I-->17
1J-->3
1J-->13
1J-->1D
1K-->13
1K-->5

class 0,2,4,V,11,12,16,1C subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
