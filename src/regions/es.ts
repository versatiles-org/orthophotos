import type { RegionPipeline } from '../lib/framework.ts';

// https://centrodedescargas.cnig.es/CentroDescargas/ortofoto-pnoa-maxima-actualidad
export default {
	id: 'es',
	metadata: {
		status: 'planned',
		notes: ['Data source identified but scraper not yet implemented.'],
	},
} satisfies RegionPipeline;
