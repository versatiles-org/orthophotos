import { downloadOrthophotos, downloadSatellite } from './lib/rsync.ts';
import { generateVPL } from './lib/vpl.ts';


await downloadOrthophotos();
await downloadSatellite();
generateVPL('orthophotos.vpl');
