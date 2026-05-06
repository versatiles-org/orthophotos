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
3["index.ts"]
B["array.ts"]
C["command.ts"]
D["delay.ts"]
E["progress.ts"]
F["retry.ts"]
G["constants.ts"]
H["fs.ts"]
I["gdal.ts"]
J["geometry.ts"]
K["pipeline.ts"]
L["process_tiles.ts"]
M["validators.ts"]
N["rate-limit.ts"]
O["remote-listing.ts"]
P["remote-zip.ts"]
Q["versatiles.ts"]
R["wms.ts"]
S["xml.ts"]
W["framework.ts"]
end
4["config.ts"]
subgraph 5["status"]
6["index.ts"]
7["geojson.ts"]
8["ascii.ts"]
9["html.ts"]
A["regions.ts"]
1C["status.ts"]
end
subgraph T["regions"]
subgraph U["**"]
V["*.ts (48 files)"]
end
end
X["preview.ts"]
subgraph Y["server"]
Z["index.ts"]
10["frontend.ts"]
11["vpl.ts"]
end
12["publish-world-local.ts"]
subgraph 13["run"]
14["index.ts"]
15["args.ts"]
16["tasks.constants.ts"]
17["commands.ts"]
18["tasks.ts"]
end
19["publish-world.ts"]
1A["run.ts"]
1B["status-check.ts"]
end
1-->3
1-->V
3-->4
3-->6
3-->B
3-->C
3-->G
3-->D
3-->H
3-->I
3-->J
3-->K
3-->L
3-->E
3-->N
3-->O
3-->P
3-->F
3-->M
3-->Q
3-->R
3-->S
6-->7
6-->9
6-->A
7-->8
C-->D
C-->E
C-->F
F-->D
H-->C
I-->C
I-->H
K-->C
K-->E
L-->B
L-->H
L-->K
L-->M
M-->C
M-->F
N-->D
N-->F
O-->4
O-->C
Q-->C
Q-->G
Q-->H
R-->C
R-->S
V-->3
X-->4
X-->3
X-->Z
Z-->10
Z-->11
10-->3
11-->4
11-->V
11-->6
12-->4
12-->3
12-->14
12-->Z
14-->15
14-->17
14-->18
15-->16
17-->4
17-->3
18-->4
18-->3
18-->V
18-->17
18-->16
19-->4
19-->3
19-->14
19-->Z
1A-->4
1A-->3
1A-->V
1A-->14
1B-->V
1B-->6

class 0,2,5,T,U,Y,13 subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
