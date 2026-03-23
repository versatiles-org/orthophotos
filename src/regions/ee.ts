import type { RegionPipeline } from '../lib/framework.ts';

export default {
	id: 'ee',
	metadata: {
		status: 'error',
		notes: [
			'No bulk download available.',
			'Only WMS available.',
			'Server is very, very slow.',
			'WMS server does not support EPSG:3857',
		],
	},
} satisfies RegionPipeline;
