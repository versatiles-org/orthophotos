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

| # | Name   | Description                                            |
| - | ------ | ------------------------------------------------------ |
| 1 | fetch  | Download source data + per-file versatiles mosaic tile |
| 2 | merge  | Merge .versatiles files + upload to remote             |
| 3 | delete | Remove local data and temp directories                 |

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

The demo is publicly accessible at [versatiles.org/satellite\_demo/](https://versatiles.org/satellite_demo/).

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
1["config.ts"]
subgraph 2["lib"]
3["array.ts"]
4["command.ts"]
5["delay.ts"]
6["progress.ts"]
7["retry.ts"]
8["constants.ts"]
9["framework.ts"]
A["fs.ts"]
B["gdal.ts"]
C["pipeline.ts"]
D["process_tiles.ts"]
E["validators.ts"]
F["rate-limit.ts"]
G["remote-zip.ts"]
H["versatiles.ts"]
I["wms.ts"]
J["xml.ts"]
end
K["preview.ts"]
subgraph L["server"]
M["frontend.ts"]
N["vpl.ts"]
end
subgraph O["regions"]
P["index.ts"]
Q["_planned.ts"]
R["al.ts"]
S["lib.ts"]
T["at.ts"]
U["be.ts"]
V["bg.ts"]
W["ch.ts"]
X["cz.ts"]
subgraph Y["de"]
Z["index.ts"]
10["baden_wuerttemberg.ts"]
11["bayern.ts"]
12["berlin.ts"]
13["brandenburg.ts"]
14["bremen.ts"]
15["hamburg.ts"]
16["hessen.ts"]
17["mecklenburg_vorpommern.ts"]
18["niedersachsen.ts"]
19["nordrhein_westfalen.ts"]
1A["rheinland_pfalz.ts"]
1B["saarland.ts"]
1C["sachsen_anhalt.ts"]
1D["sachsen.ts"]
1E["schleswig_holstein.ts"]
1F["thueringen.ts"]
end
1G["dk.ts"]
1H["ee.ts"]
subgraph 1I["fr"]
1J["index.ts"]
1K["regions.ts"]
1L["scraper.ts"]
1M["parsers.ts"]
end
1N["li.ts"]
1O["lt.ts"]
1P["lu.ts"]
1Q["lv.ts"]
1R["mt.ts"]
1S["nl.ts"]
1T["pl.ts"]
1U["pt.ts"]
1V["ro.ts"]
1W["sk.ts"]
end
subgraph 1X["status"]
1Y["index.ts"]
1Z["geojson.ts"]
20["ascii.ts"]
21["html.ts"]
22["regions.ts"]
2C["status.ts"]
end
23["publish-world-local.ts"]
subgraph 24["run"]
25["commands.ts"]
28["args.ts"]
29["tasks.constants.ts"]
2A["tasks.ts"]
end
26["publish-world.ts"]
27["run.ts"]
2B["status-check.ts"]
end
4-->5
4-->6
4-->7
7-->5
A-->4
B-->4
B-->A
C-->4
C-->6
D-->3
D-->A
D-->C
D-->E
E-->4
E-->7
F-->5
F-->7
H-->4
H-->8
H-->A
I-->4
I-->J
K-->1
K-->4
K-->M
K-->N
M-->4
N-->1
N-->P
N-->1Y
P-->Q
P-->R
P-->T
P-->U
P-->V
P-->W
P-->X
P-->Z
P-->1G
P-->1H
P-->1J
P-->1N
P-->1O
P-->1P
P-->1Q
P-->1R
P-->1S
P-->1T
P-->1U
P-->1V
P-->1W
R-->S
S-->1
S-->3
S-->4
S-->8
S-->5
S-->A
S-->B
S-->C
S-->D
S-->6
S-->F
S-->G
S-->7
S-->E
S-->H
S-->I
S-->J
T-->S
U-->S
V-->S
W-->S
X-->S
Z-->10
Z-->11
Z-->12
Z-->13
Z-->14
Z-->15
Z-->16
Z-->17
Z-->18
Z-->19
Z-->1A
Z-->1B
Z-->1C
Z-->1D
Z-->1E
Z-->1F
10-->S
11-->S
12-->S
13-->S
14-->S
15-->S
16-->S
17-->S
18-->S
19-->S
1A-->S
1B-->S
1C-->S
1D-->S
1E-->S
1F-->S
1G-->S
1H-->S
1J-->1K
1J-->1L
1L-->S
1L-->1M
1N-->S
1O-->S
1P-->S
1Q-->S
1R-->S
1S-->S
1T-->S
1U-->S
1V-->S
1W-->S
1Y-->1Z
1Y-->21
1Y-->22
1Z-->20
23-->1
23-->4
23-->A
23-->25
23-->N
25-->1
25-->4
26-->1
26-->4
26-->25
26-->N
27-->1
27-->4
27-->P
27-->28
27-->25
27-->2A
28-->29
2A-->1
2A-->A
2A-->H
2A-->P
2A-->25
2A-->29
2B-->P
2B-->1Y

class 0,2,L,O,Y,1I,1X,24 subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview\&theme=oi) for more data sources.
