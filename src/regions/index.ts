/**
 * Registry mapping region IDs to their pipeline definitions.
 * Regions without a definition here fall back to the existing runBashScript path.
 */

import type { RegionMetadata, RegionPipeline } from '../lib/framework.ts';
import al from './al.ts';
import at from './at.ts';
import ch from './ch.ts';
import cz from './cz.ts';
import dk from './dk.ts';
import fr from './fr.ts';
import li from './li.ts';
import lt from './lt.ts';
import lv from './lv.ts';
import nl from './nl.ts';
import pl from './pl.ts';
import ro from './ro.ts';
import sk from './sk.ts';
import deBadenWuerttemberg from './de_baden_wuerttemberg.ts';
import deBayern from './de_bayern.ts';
import deBerlin from './de_berlin.ts';
import deBrandenburg from './de_brandenburg.ts';
import deBremen from './de_bremen.ts';
import deHamburg from './de_hamburg.ts';
import deHessen from './de_hessen.ts';
import deMecklenburgVorpommern from './de_mecklenburg_vorpommern.ts';
import deNiedersachsen from './de_niedersachsen.ts';
import deNordrheinWestfalen from './de_nordrhein_westfalen.ts';
import deRheinlandPfalz from './de_rheinland_pfalz.ts';
import deSaarland from './de_saarland.ts';
import deSachsen from './de_sachsen.ts';
import deSachsenAnhalt from './de_sachsen_anhalt.ts';
import deSchleswigHolstein from './de_schleswig_holstein.ts';
import deThueringen from './de_thueringen.ts';

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

/**
 * Returns the metadata for a region, or undefined if no framework definition exists.
 */
export function getRegionMetadata(regionId: string): RegionMetadata | undefined {
	return registry.get(regionId)?.metadata;
}
