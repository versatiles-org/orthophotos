/**
 * Status-only region stubs — no scraper implementation yet, or permanently
 * blocked. Each entry is the same shape as a full `RegionPipeline` but with
 * only `id` and `metadata`. Bundled here to keep the per-region file count
 * focused on regions that actually do work.
 *
 * Promote an entry out of this file the moment it gets a real scraper.
 */

import type { RegionPipeline } from '../lib/index.ts';

export default [
	{
		id: 'ba',
		metadata: {
			status: 'blocked',
			notes: [
				'No open-licensed orthophoto source available — both entities of BiH gate the data behind restrictive terms.',
				'Federation of BiH (FGU): WMS published at katastar.ba/servisi (Digital orthofoto FBiH 1:5000 / 1:2500). Terms (https://www.katastar.ba/koristenje) require a written request, restrict use to the stated purpose, charge a fee, and assert "all rights reserved". Source: https://www.fgu.com.ba/en/newse-reader/new-digital-orthophoto-of-the-federation-of-bosnia-and-herzegovina-available-on-the-fga-geoportal.html',
				'Republika Srpska (RGURS): public WMS at https://geoportal.rgurs.org/geoserver/wms exposes ortofoto:Ortofoto2012 (verified — returns real imagery), but the geoportal terms state the data "cannot be used for any personal or business related needs or purposes" and allow "charging of fees for distributed data". The newer ortofoto_2021:orto_2021 layer is listed in GetCapabilities but GetMap returns LayerNotDefined (auth-gated).',
				'Re-evaluate if either entity adopts an open licence (e.g. CC BY) or if BiH joins INSPIRE with a redistributable orthoimagery service.',
			],
		},
	},
	{
		id: 'el',
		metadata: {
			status: 'blocked',
			notes: [
				'Hellenic Cadastre publishes a national orthophoto WMS at http://gis.ktimanet.gr/wms/wmsopen/wmsserver.aspx (layer "BASEMAP", 20 cm urban / 50 cm rural, 2007–2009 imagery). Verified — returns real GetMap PNGs and is publicly reachable without auth.',
				'Terms (https://www.ktimanet.gr/CitizenWebApp/Orthophotographs_Page.aspx, in Greek) explicitly prohibit any form of commercial use or exploitation of the service ("απαγορεύεται ρητά οποιασδήποτε μορφής εμπορική χρήση ή εκμετάλλευση"); the full distribution policy is "not yet announced". Re-publishing the rendered tiles on tiles.versatiles.org would violate this.',
				'Geodata.gov.gr lists an "Orthophotos for the entirety of Greece" dataset, but the entry just points back at the same Cadastre WMS — no separate open download.',
				'Re-evaluate when the Hellenic Cadastre announces an explicit open-data / re-use policy.',
			],
		},
	},
	{
		id: 'ie',
		metadata: {
			status: 'blocked',
			notes: [
				'No open-licensed orthophoto source available — neither download nor WMS.',
				'Tailte Éireann (formerly OSi) holds the national 25 cm RGBN ortho dataset (2 km × 2 km tiles in ITM, GeoTIFF). It is sold commercially via corporatesales@tailte.ie. Source: https://tailte.ie/map-shop/professional-map-products/aerial-imagery-maps-and-data/',
				'MapGenie (WMS / WMTS / ArcGIS REST) carries the same imagery but is restricted to public-sector members under the National Mapping Agreement — not redistributable.',
				'The INSPIRE Geoportal record declares "public access limited" per INSPIRE Article 13(1)(e), and the listed WMTS endpoint (inspireservices.geohive.ie) does not resolve. Source: https://inspire-geoportal.ec.europa.eu/srv/api/records/%7B5F03018E-BCA3-4173-A4F4-DCC784F19DFA%7D',
				'Re-evaluate if Tailte Éireann publishes orthos under an open licence, or if MapGenie opens beyond public-sector members.',
			],
		},
	},
	{
		id: 'it',
		metadata: {
			status: 'blocked',
			notes: [
				'No open-licensed national orthophoto source available — AGEA imagery is "all rights reserved" even when published via public WMS.',
				'Geoportale Nazionale (MASE, formerly minambiente) lists the AGEA 2012 colour ortho at http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/WMS_v1.3/raster/ortofoto_colore_12.map (capabilities advertise no fees / no access constraints), but every GetMap on layers OI.ORTOIMMAGINI.2012{,.32,.33} fails with msShapefileOpen errors against an unreachable internal NAS — the back-end is broken; only the metadata is served. Newer years (18, 22, 23, 24) return 500 from the same MapServer instance.',
				'Coverage is otherwise fragmented across all 20 regional geoportals (Piemonte, Veneto, Emilia-Romagna, Lombardia, Puglia, …), each republishing AGEA flights via its own GeoServer/MapServer. Verified examples: Piemonte AGEA 2024 RGB at https://opengis.csi.it/mp/regp_agea_2024 (layer regp_agea_2024, 30 cm) and Emilia-Romagna AGEA 2023 RGB at https://servizigis.regione.emilia-romagna.it/wms/agea2023_rgb (20 cm). Both metadata records explicitly state "AGEA(c) tutti i diritti riservati" / "utilizzo ristretto dei dati" — viewing via WMS is permitted, redistribution of rendered tiles is not.',
				'Re-evaluate if AGEA / MASE adopts a redistributable open licence (CC BY / IODL), or if any region flips its AGEA republication to an open licence at the source.',
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
		id: 'uk',
		metadata: {
			status: 'blocked',
			notes: [
				'No open-licensed orthophoto source available — neither download nor WMS.',
				'Environment Agency "Vertical Aerial Photography" (OGL v3.0) is the only government-licensed dataset, but only distributed in ECW — unsupported (proprietary GDAL plugin); see "Supported source formats" in CLAUDE.md. Source: https://environment.data.gov.uk/dataset/dae203a8-ba24-4c54-bab0-866b9faadb58',
				'The EA "Vertical Aerial Photography" WMS (https://environment.data.gov.uk/geoservices/datasets/dae203a8-ba24-4c54-bab0-866b9faadb58/wms) only exposes vector index polygons (every layer name ends in "_Index"); the actual imagery is not available via WMS.',
				'APGB (Bluesky/Getmapping consortium) provides 12.5/25 cm TIFFs and a national WMS, but the licence restricts use to UK public sector — not redistributable on tiles.versatiles.org.',
				'All other modern providers (OS MasterMap Imagery, Bluesky direct, Vexcel, Getmapping commercial) are commercial.',
				'Re-evaluate if the Environment Agency starts publishing GeoTIFFs, or if APGB licensing changes.',
			],
		},
	},
	{
		id: 'xk',
		metadata: { status: 'planned', notes: ['Data source not yet investigated.'] },
	},
] satisfies RegionPipeline[];
