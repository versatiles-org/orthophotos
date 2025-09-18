import { downloadOrthophotos, downloadSatellite } from './lib/rsync.ts';


await downloadOrthophotos();
await downloadSatellite();
//generateVPL();
