import { downloadFrontend } from './frontend.ts';
import { downloadOrthophotos, downloadSatellite } from './rsync.ts';
import { generateVPL } from './vpl.ts';

await downloadOrthophotos();
await downloadSatellite();
await downloadFrontend();
generateVPL('orthophotos.vpl');
