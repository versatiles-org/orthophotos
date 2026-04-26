import { type RegionPipeline } from './lib.ts';

export default {
	id: 'ie',
	metadata: { status: 'blocked', notes: ['The only available format is the proprietary ECW format.'] },
} satisfies RegionPipeline;
