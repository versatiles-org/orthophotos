/**
 * Public surface for the `quality-zones/` subsystem (settlement-proximity PNG for adaptive tile quality).
 * Consumers outside `quality-zones/` should import from this barrel
 * rather than reaching into individual files.
 */

export { buildQualityZones, isUrl } from './build.ts';
