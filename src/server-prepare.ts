import { downloadFrontend } from './server/frontend.ts';
import { generateVPL } from './server/vpl.ts';

await downloadFrontend();
generateVPL('orthophotos.vpl');
