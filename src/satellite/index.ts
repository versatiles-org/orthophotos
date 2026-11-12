/**
 * Public surface for the `satellite/` subsystem: the global satellite base layers under the
 * orthophotos. They run through the same tasks as regions (`./run.sh satellite/sentinel2 1-3`),
 * but are kept out of the region registry, so they don't appear on the status page, in the
 * orthophoto layers of the VPL or in `check:remote`. See `docs/satellite.md`.
 */

import type { RegionPipeline } from '../lib/index.ts';
import sentinel2 from './sentinel2.ts';

export const satellitePipelines: RegionPipeline[] = [sentinel2];
