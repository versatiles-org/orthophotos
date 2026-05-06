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
B["array.ts"]
C["constants.ts"]
D["fs.ts"]
E["gdal.ts"]
F["geometry.ts"]
G["pipeline.ts"]
H["process_tiles.ts"]
I["validators.ts"]
J["rate-limit.ts"]
K["remote-zip.ts"]
L["versatiles.ts"]
M["wms.ts"]
N["xml.ts"]
V["framework.ts"]
end
4["config.ts"]
subgraph 9["regions"]
A["*.ts (28 files)"]
subgraph R["de"]
S["*.ts (17 files)"]
end
subgraph T["fr"]
U["*.ts (4 files)"]
end
end
subgraph O["status"]
P["geojson.ts"]
Q["ascii.ts"]
10["index.ts"]
11["html.ts"]
12["regions.ts"]
1C["status.ts"]
end
W["preview.ts"]
subgraph X["server"]
Y["frontend.ts"]
Z["vpl.ts"]
end
13["publish-world-local.ts"]
subgraph 14["run"]
15["commands.ts"]
18["args.ts"]
19["tasks.constants.ts"]
1A["tasks.ts"]
end
16["publish-world.ts"]
17["run.ts"]
1B["status-check.ts"]
end
1-->3
1-->A
3-->4
3-->5
5-->6
5-->7
5-->8
8-->6
A-->S
A-->U
A-->4
A-->B
A-->5
A-->C
A-->6
A-->D
A-->E
A-->F
A-->G
A-->H
A-->7
A-->J
A-->K
A-->8
A-->I
A-->L
A-->M
A-->N
A-->P
D-->5
E-->5
E-->D
G-->5
G-->7
H-->B
H-->D
H-->G
H-->I
I-->5
I-->8
J-->6
J-->8
L-->5
L-->C
L-->D
M-->5
M-->N
P-->Q
S-->A
U-->A
W-->4
W-->5
W-->Y
W-->Z
Y-->5
Z-->4
Z-->A
Z-->10
10-->P
10-->11
10-->12
13-->4
13-->5
13-->D
13-->15
13-->Z
15-->4
15-->5
16-->4
16-->5
16-->15
16-->Z
17-->4
17-->5
17-->A
17-->18
17-->15
17-->1A
18-->19
1A-->4
1A-->D
1A-->L
1A-->A
1A-->15
1A-->19
1B-->A
1B-->10

class 0,2,9,R,T,O,X,14 subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview&theme=oi) for more data sources.
