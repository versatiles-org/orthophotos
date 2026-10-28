import { inlineSources, osm } from '@versatiles/style';
import { withRetry } from '../lib/index.ts';

type StyleSpecification = ReturnType<typeof osm>;

/**
 * Builds the self-contained MapLibre style for the status page map: a dark,
 * desaturated basemap with only fills and country labels. TileJSON sources are
 * inlined so the browser needs no style library and no extra round-trip.
 *
 * The status page adds its region layers below `metadata.beforeId`, so country
 * labels stay on top of the region fills.
 */
export async function generateMapStyle(): Promise<StyleSpecification> {
	const style = osm({
		theme: 'colorful-dark',
		urls: { base: 'https://tiles.versatiles.org' },
		recolor: { saturate: -0.9 },
		colors: { labelHalo: 'rgba(0,0,0,0.7)' },
		text: { haloWidth: 1, haloBlur: 1 },
		projection: 'mercator',
		layers: {
			roads: false,
			transit: false,
			boundaries: false,
			markings: false,
			pois: false,
			airport: false,
			water: { rivers: false, piers: false },
			labels: {
				boundaries: { countries: true, states: false },
				places: false,
				streets: false,
				water: false,
				addresses: false,
			},
		},
	});
	style.metadata = { ...(style.metadata as object), beforeId: osm.slots.belowLabels };
	return withRetry(() => inlineSources(style), { maxAttempts: 3 });
}
