import { defineRegion } from '../lib/framework.ts';

export default defineRegion(
	'ee',
	{
		status: 'error',
		notes: [
			'No bulk download available.',
			'Only WMS available.',
			'Server is very, very slow.',
			'WMS server does not support EPSG:3857',
		],
	},
	[],
);
