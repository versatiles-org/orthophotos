import { downloadFrontend } from './server/frontend.ts';
import { generateVPL } from './server/vpl.ts';

await downloadFrontend();
generateVPL('orthophotos.vpl', true); // Generate debug VPL with all layers visible for testing
