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
npm run coverage       # Run tests with coverage
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
5["progress.ts"]
6["retry.ts"]
7["concurrency.ts"]
8["constants.ts"]
9["framework.ts"]
A["fs.ts"]
B["pipeline.ts"]
C["process_tiles.ts"]
D["validators.ts"]
E["remote-zip.ts"]
F["wms.ts"]
end
G["preview.ts"]
subgraph H["server"]
I["frontend.ts"]
J["vpl.ts"]
end
subgraph K["regions"]
L["index.ts"]
M["al.ts"]
N["lib.ts"]
Q["at.ts"]
R["be.ts"]
S["bg.ts"]
T["ch.ts"]
U["cy.ts"]
V["cz.ts"]
W["de.ts"]
X["de_baden_wuerttemberg.ts"]
Y["de_bayern.ts"]
Z["de_berlin.ts"]
10["de_brandenburg.ts"]
11["de_bremen.ts"]
12["de_hamburg.ts"]
13["de_hessen.ts"]
14["de_mecklenburg_vorpommern.ts"]
15["de_niedersachsen.ts"]
16["de_nordrhein_westfalen.ts"]
17["de_rheinland_pfalz.ts"]
18["de_saarland.ts"]
19["de_sachsen_anhalt.ts"]
1A["de_sachsen.ts"]
1B["de_schleswig_holstein.ts"]
1C["de_thueringen.ts"]
1D["dk.ts"]
1E["ee.ts"]
1F["el.ts"]
1G["es.ts"]
1H["fi.ts"]
1I["fr.ts"]
1J["hr.ts"]
1K["hu.ts"]
1L["ie.ts"]
1M["it.ts"]
1N["li.ts"]
1O["lt.ts"]
1P["lu.ts"]
1Q["lv.ts"]
1R["mt.ts"]
1S["nl.ts"]
1T["no.ts"]
1U["pl.ts"]
1V["pt.ts"]
1W["ro.ts"]
1X["se.ts"]
1Y["si.ts"]
1Z["sk.ts"]
end
subgraph O["run"]
P["commands.ts"]
26["args.ts"]
27["tasks.constants.ts"]
28["tasks.ts"]
end
subgraph 20["status"]
21["geojson.ts"]
22["ascii.ts"]
2A["html.ts"]
2B["regions.ts"]
2C["status.ts"]
end
23["publish-world-local.ts"]
24["publish-world.ts"]
25["run.ts"]
29["status-check.ts"]
end
4-->5
4-->6
A-->4
B-->4
B-->7
B-->5
C-->3
C-->7
C-->B
C-->D
D-->4
F-->4
G-->1
G-->4
G-->I
G-->J
I-->4
J-->1
J-->L
J-->21
L-->M
L-->Q
L-->R
L-->S
L-->T
L-->U
L-->V
L-->W
L-->1D
L-->1E
L-->1F
L-->1G
L-->1H
L-->1I
L-->1J
L-->1K
L-->1L
L-->1M
L-->1N
L-->1O
L-->1P
L-->1Q
L-->1R
L-->1S
L-->1T
L-->1U
L-->1V
L-->1W
L-->1X
L-->1Y
L-->1Z
M-->N
N-->1
N-->3
N-->4
N-->8
N-->A
N-->B
N-->C
N-->5
N-->E
N-->6
N-->D
N-->F
N-->P
P-->1
P-->4
P-->8
P-->A
Q-->N
R-->N
S-->N
T-->N
V-->N
W-->X
W-->Y
W-->Z
W-->10
W-->11
W-->12
W-->13
W-->14
W-->15
W-->16
W-->17
W-->18
W-->19
W-->1A
W-->1B
W-->1C
X-->N
Y-->N
Z-->N
10-->N
11-->N
12-->N
13-->N
14-->N
15-->N
16-->N
17-->N
18-->N
19-->N
1A-->N
1B-->N
1C-->N
1D-->N
1E-->N
1I-->N
1N-->N
1O-->N
1P-->N
1Q-->N
1R-->N
1S-->N
1U-->N
1V-->N
1W-->N
1Z-->N
21-->22
23-->1
23-->4
23-->A
23-->P
23-->J
24-->1
24-->4
24-->P
24-->J
25-->1
25-->4
25-->L
25-->26
25-->P
25-->28
26-->27
28-->1
28-->A
28-->L
28-->P
28-->27
29-->L
29-->21
29-->2A
29-->2B

class 0,2,H,K,O,20 subgraphs;
classDef subgraphs fill-opacity:0.1, fill:#888, color:#888, stroke:#888;
```

## Notes

Also check the [EU/EC INSPIRE Geoportal](https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/overview?view=themeOverview\&theme=oi) for more data sources.
