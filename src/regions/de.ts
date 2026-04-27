/**
 * German Bundesländer — explicit list of 16 sub-region pipelines.
 *
 * Add new Bundesländer to `bundeslaender` below, not via wildcard re-export,
 * so a renamed/removed export fails loudly at compile time instead of being
 * silently dropped from the registry.
 */

import type { RegionPipeline } from '../lib/framework.ts';
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

const bundeslaender: RegionPipeline[] = [
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

export default bundeslaender;
