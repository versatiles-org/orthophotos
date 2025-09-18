import { downloadFrontend } from './lib/frontend.ts';
import { downloadOrthophotos, downloadSatellite } from './lib/rsync.ts';
import { generateVPL } from './lib/vpl.ts';


await downloadOrthophotos();
await downloadSatellite();
await downloadFrontend();
generateVPL('orthophotos.vpl');
