/**
 * Registry mapping region IDs to their pipeline definitions.
 * Regions without a definition here fall back to the existing runBashScript path.
 */

import type { RegionPipeline } from './framework.ts';
import al from './regions/al.ts';
import at from './regions/at.ts';
import ch from './regions/ch.ts';
import cz from './regions/cz.ts';
import dk from './regions/dk.ts';
import fr from './regions/fr.ts';
import li from './regions/li.ts';
import lt from './regions/lt.ts';
import lv from './regions/lv.ts';
import nl from './regions/nl.ts';
import pl from './regions/pl.ts';
import ro from './regions/ro.ts';
import sk from './regions/sk.ts';
import deBadenWuerttemberg from './regions/de_baden_wuerttemberg.ts';
import deBayern from './regions/de_bayern.ts';
import deBerlin from './regions/de_berlin.ts';
import deBrandenburg from './regions/de_brandenburg.ts';
import deBremen from './regions/de_bremen.ts';
import deHamburg from './regions/de_hamburg.ts';
import deHessen from './regions/de_hessen.ts';
import deMecklenburgVorpommern from './regions/de_mecklenburg_vorpommern.ts';
import deNiedersachsen from './regions/de_niedersachsen.ts';
import deNordrheinWestfalen from './regions/de_nordrhein_westfalen.ts';
import deRheinlandPfalz from './regions/de_rheinland_pfalz.ts';
import deSaarland from './regions/de_saarland.ts';
import deSachsen from './regions/de_sachsen.ts';
import deSachsenAnhalt from './regions/de_sachsen_anhalt.ts';
import deSchleswigHolstein from './regions/de_schleswig_holstein.ts';
import deThueringen from './regions/de_thueringen.ts';

const pipelines: RegionPipeline[] = [
	al,
	at,
	ch,
	cz,
	dk,
	fr,
	li,
	lt,
	lv,
	nl,
	pl,
	ro,
	sk,
	deBadenWuerttemberg,
	deBayern,
	deBerlin,
	deBrandenburg,
	deBremen,
	deHamburg,
	deHessen,
	deMecklenburgVorpommern,
	deNiedersachsen,
	deNordrheinWestfalen,
	deRheinlandPfalz,
	deSaarland,
	deSachsen,
	deSachsenAnhalt,
	deSchleswigHolstein,
	deThueringen,
];

const registry = new Map<string, RegionPipeline>();
for (const p of pipelines) {
	registry.set(p.id, p);
}

/**
 * Returns the pipeline for a region, or undefined if no framework definition exists.
 */
export function getRegionPipeline(regionId: string): RegionPipeline | undefined {
	return registry.get(regionId);
}
