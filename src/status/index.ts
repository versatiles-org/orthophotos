/**
 * Public surface for the status subsystem (geojson loading, status-page HTML,
 * region scanning). Consumers outside `status/` should import from this barrel
 * rather than reaching into individual files. `status.ts` and `ascii.ts` are
 * internal helpers and stay private.
 */

export { loadKnownRegions, reducePrecision, type KnownRegion, type ValidRegion } from './geojson.ts';
export { generateStatusPage } from './html.ts';
export { scanRegions, type Region } from './regions.ts';
