/**
 * Status-only region stubs — no scraper implementation yet, or permanently
 * blocked. Each entry is the same shape as a full `RegionPipeline` but with
 * only `id` and `metadata`. Bundled here to keep the per-region file count
 * focused on regions that actually do work.
 *
 * Promote an entry out of this file the moment it gets a real scraper.
 */

import type { RegionPipeline } from '../lib/framework.ts';

export default [
	{
		id: 'ba',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'cy',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'el',
		metadata: { status: 'blocked', notes: ['No data found.'] },
	},
	{
		id: 'es',
		metadata: {
			status: 'planned',
			notes: [
				'Data source identified but scraper not yet implemented.',
				'See https://centrodedescargas.cnig.es/CentroDescargas/ortofoto-pnoa-maxima-actualidad',
			],
		},
	},
	{
		id: 'fi',
		metadata: { status: 'blocked', notes: ['Access restricted'] },
	},
	{
		id: 'hr',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'hu',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'ie',
		metadata: { status: 'blocked', notes: ['The only available format is the proprietary ECW format.'] },
	},
	{
		id: 'is',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'it',
		metadata: {
			status: 'planned',
			notes: [
				'Data source identified but scraper not yet implemented.',
				'See http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/WMS_v1.3/raster/ortofoto_colore_12.map',
				'See https://www.dati.gov.it/node/192?tags=modello-digitale-del-terreno',
			],
		},
	},
	{
		id: 'me',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'mk',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'no',
		metadata: { status: 'blocked', notes: ['Access restricted'] },
	},
	{
		id: 'rs',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'se',
		metadata: { status: 'blocked', notes: ['Access restricted'] },
	},
	{
		id: 'si',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'tr',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'ua',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
	{
		id: 'xk',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
] satisfies RegionPipeline[];
