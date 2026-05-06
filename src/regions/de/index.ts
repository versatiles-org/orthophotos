/**
 * German Bundesländer — explicit list of 16 sub-region pipelines.
 *
 * Add new Bundesländer to `bundeslaender` below, not via wildcard re-export,
 * so a renamed/removed export fails loudly at compile time instead of being
 * silently dropped from the registry.
 */

import type { RegionPipeline } from '../../lib/index.ts';
import badenWuerttemberg from './baden_wuerttemberg.ts';
import bayern from './bayern.ts';
import berlin from './berlin.ts';
import brandenburg from './brandenburg.ts';
import bremen from './bremen.ts';
import hamburg from './hamburg.ts';
import hessen from './hessen.ts';
import mecklenburgVorpommern from './mecklenburg_vorpommern.ts';
import niedersachsen from './niedersachsen.ts';
import nordrheinWestfalen from './nordrhein_westfalen.ts';
import rheinlandPfalz from './rheinland_pfalz.ts';
import saarland from './saarland.ts';
import sachsen from './sachsen.ts';
import sachsenAnhalt from './sachsen_anhalt.ts';
import schleswigHolstein from './schleswig_holstein.ts';
import thueringen from './thueringen.ts';

const bundeslaender: RegionPipeline[] = [
	badenWuerttemberg,
	bayern,
	berlin,
	brandenburg,
	bremen,
	hamburg,
	hessen,
	mecklenburgVorpommern,
	niedersachsen,
	nordrheinWestfalen,
	rheinlandPfalz,
	saarland,
	sachsen,
	sachsenAnhalt,
	schleswigHolstein,
	thueringen,
];

export default bundeslaender;
