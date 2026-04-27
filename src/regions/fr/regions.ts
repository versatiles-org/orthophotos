/**
 * NUTS-1 région → département mapping.
 *
 * Each entry produces one French sub-région scraper via `defineFrSubRegion`
 * (see `scraper.ts`). All 18 régions share the same BD ORTHO® feed and differ
 * only in which IGN département codes they cover.
 */

import type { FrSubRegionOptions } from './scraper.ts';

export const FR_REGIONS: FrSubRegionOptions[] = [
	{
		name: 'fr/auvergne_rhone_alpes',
		// Ain, Allier, Ardèche, Cantal, Drôme, Isère, Loire, Haute-Loire,
		// Puy-de-Dôme, Rhône, Savoie, Haute-Savoie
		departmentCodes: ['D001', 'D003', 'D007', 'D015', 'D026', 'D038', 'D042', 'D043', 'D063', 'D069', 'D073', 'D074'],
	},
	{
		name: 'fr/bourgogne_franche_comte',
		// Côte-d'Or, Doubs, Jura, Nièvre, Haute-Saône, Saône-et-Loire, Yonne,
		// Territoire de Belfort
		departmentCodes: ['D021', 'D025', 'D039', 'D058', 'D070', 'D071', 'D089', 'D090'],
	},
	{
		name: 'fr/bretagne',
		// Côtes-d'Armor, Finistère, Ille-et-Vilaine, Morbihan
		departmentCodes: ['D022', 'D029', 'D035', 'D056'],
	},
	{
		name: 'fr/centre_val_de_loire',
		// Cher, Eure-et-Loir, Indre, Indre-et-Loire, Loir-et-Cher, Loiret
		departmentCodes: ['D018', 'D028', 'D036', 'D037', 'D041', 'D045'],
	},
	{
		name: 'fr/corse',
		// Corse-du-Sud, Haute-Corse
		departmentCodes: ['D02A', 'D02B'],
	},
	{
		name: 'fr/grand_est',
		// Ardennes, Aube, Marne, Haute-Marne, Meurthe-et-Moselle, Meuse, Moselle,
		// Bas-Rhin, Haut-Rhin, Vosges
		departmentCodes: ['D008', 'D010', 'D051', 'D052', 'D054', 'D055', 'D057', 'D067', 'D068', 'D088'],
	},
	{
		name: 'fr/hauts_de_france',
		// Aisne, Nord, Oise, Pas-de-Calais, Somme
		departmentCodes: ['D002', 'D059', 'D060', 'D062', 'D080'],
	},
	{
		name: 'fr/ile_de_france',
		// Paris, Seine-et-Marne, Yvelines, Essonne, Hauts-de-Seine,
		// Seine-Saint-Denis, Val-de-Marne, Val-d'Oise
		departmentCodes: ['D075', 'D077', 'D078', 'D091', 'D092', 'D093', 'D094', 'D095'],
	},
	{
		name: 'fr/normandie',
		// Calvados, Eure, Manche, Orne, Seine-Maritime
		departmentCodes: ['D014', 'D027', 'D050', 'D061', 'D076'],
	},
	{
		name: 'fr/nouvelle_aquitaine',
		// Charente, Charente-Maritime, Corrèze, Creuse, Dordogne, Gironde, Landes,
		// Lot-et-Garonne, Pyrénées-Atlantiques, Deux-Sèvres, Vienne, Haute-Vienne
		departmentCodes: ['D016', 'D017', 'D019', 'D023', 'D024', 'D033', 'D040', 'D047', 'D064', 'D079', 'D086', 'D087'],
	},
	{
		name: 'fr/occitanie',
		// Ariège, Aude, Aveyron, Gard, Haute-Garonne, Gers, Hérault, Lot, Lozère,
		// Hautes-Pyrénées, Pyrénées-Orientales, Tarn, Tarn-et-Garonne
		departmentCodes: [
			'D009',
			'D011',
			'D012',
			'D030',
			'D031',
			'D032',
			'D034',
			'D046',
			'D048',
			'D065',
			'D066',
			'D081',
			'D082',
		],
	},
	{
		name: 'fr/pays_de_la_loire',
		// Loire-Atlantique, Maine-et-Loire, Mayenne, Sarthe, Vendée
		departmentCodes: ['D044', 'D049', 'D053', 'D072', 'D085'],
	},
	{
		name: 'fr/provence_alpes_cote_d_azur',
		// Alpes-de-Haute-Provence, Hautes-Alpes, Alpes-Maritimes,
		// Bouches-du-Rhône, Var, Vaucluse
		departmentCodes: ['D004', 'D005', 'D006', 'D013', 'D083', 'D084'],
	},
	// DROM (overseas NUTS-1 régions)
	{ name: 'fr/guadeloupe', departmentCodes: ['D971'] },
	{ name: 'fr/martinique', departmentCodes: ['D972'] },
	{ name: 'fr/guyane', departmentCodes: ['D973'] },
	{ name: 'fr/la_reunion', departmentCodes: ['D974'] },
	{ name: 'fr/mayotte', departmentCodes: ['D976'] },
];
