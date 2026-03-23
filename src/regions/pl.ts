import { defineTileRegion } from '../lib/process_tiles.ts';

export default defineTileRegion({
	name: 'pl',
	meta: {
		status: 'error',
		notes: [
			'No bulk download available.',
			'Only WMS available.',
			'Server is very, very slow.',
			'Unknown license.',
			'Server returns errors.',
		],
		license: {
			name: 'Unknown',
			url: 'https://www.geoportal.gov.pl/en/data/orthophotomap-orto/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Główny Urząd Geodezji i Kartografii',
			url: 'https://www.geoportal.gov.pl/en/data/orthophotomap-orto/',
		},
		date: '2023',
	},
	init: () => [],
	download: async () => ({}),
	convert: async () => {},
	minFiles: 123456,
});
