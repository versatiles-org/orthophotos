import { bashStep, defineRegion } from '../framework.ts';
import { expectFile } from '../validators.ts';
import { join } from 'node:path';

export default defineRegion('li', [
	bashStep('fetch', {
		scriptFile: '1_fetch.sh',
		validate: async (ctx) => {
			await expectFile(join(ctx.dataDir, 'tiles', 'image.tif'));
		},
	}),
]);
