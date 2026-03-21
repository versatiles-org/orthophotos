import { defineRegion } from '../lib/framework.ts';

export default defineRegion(
	'ie',
	{ status: 'error', notes: ['The only available format is the proprietary ECW format.'] },
	[],
);
