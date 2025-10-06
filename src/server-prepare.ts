import { downloadFrontend } from './server/frontend.ts';
import { downloadOrthophotos, downloadSatellite } from './server/rsync.ts';
import { generateVPL } from './server/vpl.ts';

await downloadOrthophotos();
await downloadSatellite();
await downloadFrontend();
generateVPL('orthophotos.vpl');
