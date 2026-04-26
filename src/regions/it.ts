import { type RegionPipeline } from './lib.ts';

// http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/WMS_v1.3/raster/ortofoto_colore_12.map
export default {
	id: 'it',
	metadata: {
		status: 'planned',
		notes: ['Data source identified but scraper not yet implemented.'],
	},
} satisfies RegionPipeline;
