/**
 * French orthophoto sub-régions (NUTS-1).
 *
 * All 18 régions pull from the same IGN Géoplateforme BD ORTHO® ATOM feed
 * (https://data.geopf.fr/telechargement/resource/BDORTHO) and differ only in
 * which départements they cover.
 *
 *   parsers.ts — pure XML helpers + IndexEntry type
 *   scraper.ts — defineFrSubRegion factory + fetchIndexPages + private helpers
 *   regions.ts — FR_REGIONS data table (NUTS-1 → département mapping)
 *   index.ts   — assembly point (this file)
 */

import { FR_REGIONS } from './regions.ts';
import { defineFrSubRegion } from './scraper.ts';

export default FR_REGIONS.map(defineFrSubRegion);
