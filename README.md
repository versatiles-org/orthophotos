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
C["region-api.ts"]
G["array.ts"]
H["constants.ts"]
I["fs.ts"]
J["gdal.ts"]
K["geometry.ts"]
L["pipeline.ts"]
M["process_tiles.ts"]
N["validators.ts"]
O["rate-limit.ts"]
P["remote-zip.ts"]
Q["versatiles.ts"]
R["wms.ts"]
S["xml.ts"]
T["framework.ts"]
end
4["config.ts"]
subgraph 9["regions"]
subgraph A["**"]
B["*.ts (48 files)"]
end
end
subgraph D["status"]
E["geojson.ts"]
F["ascii.ts"]
Y["index.ts"]
Z["html.ts"]
10["regions.ts"]
1A["status.ts"]
end
U["preview.ts"]
subgraph V["server"]
W["frontend.ts"]
X["vpl.ts"]
end
11["publish-world-local.ts"]
subgraph 12["run"]
13["commands.ts"]
16["args.ts"]
17["tasks.constants.ts"]
18["tasks.ts"]
end
14["publish-world.ts"]
15["run.ts"]
19["status-check.ts"]
end
1-->3
1-->B
3-->4
3-->5
5-->6
5-->7
5-->8
8-->6
B-->C
C-->4
C-->E
C-->G
C-->5
C-->H
C-->6
C-->I
C-->J
C-->K
C-->L
C-->M
C-->7
C-->O
C-->P
C-->8
C-->N
C-->Q
C-->R
C-->S
E-->F
I-->5
J-->5
J-->I
L-->5
L-->7
M-->G
M-->I
M-->L
M-->N
N-->5
N-->8
O-->6
O-->8
Q-->5
Q-->H
Q-->I
R-->5
R-->S
U-->4
U-->5
U-->W
U-->X
W-->5
X-->4
X-->B
X-->Y
Y-->E
Y-->Z
Y-->10
11-->4
11-->5
11-->I
11-->13
11-->X
13-->4
13-->5
14-->4
14-->5
14-->13
14-->X
15-->4
15-->5
15-->B
15-->16
15-->13
15-->18
16-->17
18-->4
18-->I
18-->Q
18-->B
18-->13
18-->17
19-->B
19-->Y

class 0,2,9,A,D,V,12 subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
