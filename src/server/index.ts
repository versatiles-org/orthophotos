/**
 * Public surface for the `server/` subsystem (frontend download + VPL
 * generation). Consumers outside `server/` should import from this barrel
 * rather than reaching into individual files.
 */

export { downloadFrontend } from './frontend.ts';
export { generateVPL, type VPLOptions } from './vpl.ts';
