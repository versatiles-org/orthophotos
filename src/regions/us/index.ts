/**
 * US orthophotos from NAIP, one region per state of the lower 48 (Alaska has no NAIP).
 *
 *   scraper.ts — defineUsState factory: listing, download, tiling
 *   states.ts  — US_STATES data table: state code, NAIP year, resolution, file count
 *   index.ts   — assembly point (this file)
 */

import { defineUsState } from './scraper.ts';
import { US_STATES } from './states.ts';

export default US_STATES.map(defineUsState);
