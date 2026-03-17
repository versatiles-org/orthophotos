import { bashStep, defineRegion } from '../framework.ts';
import { expectMinFiles } from '../validators.ts';
import { join } from 'node:path';

export default defineRegion('de/rheinland_pfalz', [
	bashStep('fetch', {
		scriptFile: '1_fetch.sh',
		validate: async (ctx) => {
			await expectMinFiles(join(ctx.dataDir, 'tiles'), '*', 50);
		},
	}),
]);
