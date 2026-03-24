import { downloadFrontend } from './server/frontend.ts';
import { downloadSatellite } from './server/rsync.ts';
import { generateVPL } from './server/vpl.ts';

await downloadSatellite();
await downloadFrontend();
generateVPL('orthophotos.vpl');
