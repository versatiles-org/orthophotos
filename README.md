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
13["framework.ts"]
end
subgraph 4["status"]
5["index.ts"]
6["geojson.ts"]
7["ascii.ts"]
8["html.ts"]
9["regions.ts"]
A["style.ts"]
1K["status.ts"]
end
subgraph V["quality-zones"]
W["index.ts"]
X["build.ts"]
Y["steps.ts"]
end
Z["check-remote.ts"]
subgraph 10["regions"]
subgraph 11["**"]
12["*.ts (49 files)"]
end
end
14["preview.ts"]
subgraph 15["server"]
16["index.ts"]
17["frontend.ts"]
18["vpl.ts"]
end
19["publish-hashes.ts"]
1A["publish-world-local.ts"]
subgraph 1B["run"]
1C["index.ts"]
1D["args.ts"]
1E["tasks.constants.ts"]
1F["commands.ts"]
1G["tasks.ts"]
end
1H["publish-world.ts"]
1I["run.ts"]
1J["status-check.ts"]
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
W-->Y
X-->3
X-->Y
Z-->3
Z-->12
12-->3
14-->3
14-->16
16-->17
16-->18
17-->3
18-->3
18-->12
18-->5
19-->3
1A-->3
1A-->1C
1A-->16
1C-->1D
1C-->1F
1C-->1G
1D-->1E
1F-->3
1G-->3
1G-->12
1G-->1F
1G-->1E
1H-->3
1H-->1C
1H-->16
1I-->3
1I-->12
1I-->1C
1J-->12
1J-->5

class 0,2,4,V,10,11,15,1B subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
