import type { RegionPipeline } from '../lib/framework.ts';

export default {
	id: 'ie',
	metadata: { status: 'error', notes: ['The only available format is the proprietary ECW format.'] },
} satisfies RegionPipeline;
