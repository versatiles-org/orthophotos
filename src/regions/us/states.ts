/**
 * The NAIP year per state of the lower 48, from the Planetary Computer container on 2026-11-16:
 * the newest year with at least 95% of the files of the fullest of the state's three newest
 * years. Newer years still being filled were left out then: Maine 2025 (744 of 2,754 files),
 * North Dakota 2025 (866 of 5,712), West Virginia 2024 (101 of 1,831), and the empty 2024 folders
 * of Nebraska, North Carolina, North Dakota and Pennsylvania.
 *
 * `minFiles` is 98% of the files counted. All years together: 186 TB of GeoTIFFs, of which
 * about 88 TB is read, since 30 cm files are read at their 60 cm overview.
 */

import type { UsStateOptions } from './scraper.ts';

export const US_STATES: UsStateOptions[] = [
	{ name: 'us/alabama', code: 'al', year: 2025, resolution: 30, minFiles: 3411 }, // 3481 files, 6.45 TB
	{ name: 'us/arizona', code: 'az', year: 2025, resolution: 60, minFiles: 7475 }, // 7628 files, 2.96 TB
	{ name: 'us/arkansas', code: 'ar', year: 2025, resolution: 60, minFiles: 3513 }, // 3585 files, 1.71 TB
	{ name: 'us/california', code: 'ca', year: 2024, resolution: 60, minFiles: 10847 }, // 11069 files, 4.92 TB
	{ name: 'us/colorado', code: 'co', year: 2023, resolution: 30, minFiles: 7274 }, // 7423 files, 14.92 TB
	{ name: 'us/connecticut', code: 'ct', year: 2025, resolution: 60, minFiles: 404 }, // 413 files, 0.19 TB
	{ name: 'us/delaware', code: 'de', year: 2023, resolution: 30, minFiles: 172 }, // 176 files, 0.24 TB
	{ name: 'us/florida', code: 'fl', year: 2025, resolution: 30, minFiles: 3726 }, // 3803 files, 6.92 TB
	{ name: 'us/georgia', code: 'ga', year: 2025, resolution: 30, minFiles: 3834 }, // 3913 files, 7.27 TB
	{ name: 'us/idaho', code: 'id', year: 2025, resolution: 30, minFiles: 6420 }, // 6552 files, 9.43 TB
	{ name: 'us/illinois', code: 'il', year: 2025, resolution: 60, minFiles: 4048 }, // 4131 files, 1.51 TB
	{ name: 'us/indiana', code: 'in', year: 2025, resolution: 60, minFiles: 2634 }, // 2688 files, 1.16 TB
	{ name: 'us/iowa', code: 'ia', year: 2025, resolution: 60, minFiles: 4153 }, // 4238 files, 1.44 TB
	{ name: 'us/kansas', code: 'ks', year: 2025, resolution: 30, minFiles: 5783 }, // 5902 files, 7.89 TB
	{ name: 'us/kentucky', code: 'ky', year: 2024, resolution: 60, minFiles: 2855 }, // 2914 files, 1.32 TB
	{ name: 'us/louisiana', code: 'la', year: 2025, resolution: 60, minFiles: 3224 }, // 3290 files, 1.60 TB
	{ name: 'us/maine', code: 'me', year: 2021, resolution: 60, minFiles: 2698 }, // 2754 files, 1.25 TB
	{ name: 'us/maryland', code: 'md', year: 2023, resolution: 30, minFiles: 882 }, // 901 files, 1.21 TB
	{ name: 'us/massachusetts', code: 'ma', year: 2025, resolution: 60, minFiles: 729 }, // 744 files, 0.32 TB
	{ name: 'us/michigan', code: 'mi', year: 2024, resolution: 60, minFiles: 4749 }, // 4846 files, 1.95 TB
	{ name: 'us/minnesota', code: 'mn', year: 2025, resolution: 60, minFiles: 6654 }, // 6790 files, 2.41 TB
	{ name: 'us/mississippi', code: 'ms', year: 2025, resolution: 30, minFiles: 3167 }, // 3232 files, 5.91 TB
	{ name: 'us/missouri', code: 'mo', year: 2024, resolution: 30, minFiles: 4917 }, // 5018 files, 7.18 TB
	{ name: 'us/montana', code: 'mt', year: 2025, resolution: 30, minFiles: 11535 }, // 11771 files, 15.23 TB
	{ name: 'us/nebraska', code: 'ne', year: 2025, resolution: 30, minFiles: 5522 }, // 5635 files, 7.60 TB
	{ name: 'us/nevada', code: 'nv', year: 2024, resolution: 60, minFiles: 7252 }, // 7400 files, 3.13 TB
	{ name: 'us/new_hampshire', code: 'nh', year: 2025, resolution: 60, minFiles: 755 }, // 771 files, 0.35 TB
	{ name: 'us/new_jersey', code: 'nj', year: 2025, resolution: 60, minFiles: 621 }, // 634 files, 0.27 TB
	{ name: 'us/new_mexico', code: 'nm', year: 2024, resolution: 30, minFiles: 7854 }, // 8015 files, 12.17 TB
	{ name: 'us/new_york', code: 'ny', year: 2024, resolution: 60, minFiles: 3796 }, // 3874 files, 1.63 TB
	{ name: 'us/north_carolina', code: 'nc', year: 2025, resolution: 30, minFiles: 3510 }, // 3582 files, 6.33 TB
	{ name: 'us/north_dakota', code: 'nd', year: 2023, resolution: 60, minFiles: 5597 }, // 5712 files, 2.04 TB
	{ name: 'us/ohio', code: 'oh', year: 2025, resolution: 60, minFiles: 2985 }, // 3046 files, 1.11 TB
	{ name: 'us/oklahoma', code: 'ok', year: 2025, resolution: 60, minFiles: 4717 }, // 4814 files, 1.87 TB
	{ name: 'us/oregon', code: 'or', year: 2024, resolution: 60, minFiles: 7315 }, // 7465 files, 2.96 TB
	{ name: 'us/pennsylvania', code: 'pa', year: 2022, resolution: 60, minFiles: 3172 }, // 3237 files, 1.38 TB
	{ name: 'us/rhode_island', code: 'ri', year: 2025, resolution: 60, minFiles: 113 }, // 116 files, 0.05 TB
	{ name: 'us/south_carolina', code: 'sc', year: 2025, resolution: 30, minFiles: 2026 }, // 2068 files, 3.62 TB
	{ name: 'us/south_dakota', code: 'sd', year: 2025, resolution: 30, minFiles: 5872 }, // 5992 files, 7.73 TB
	{ name: 'us/tennessee', code: 'tn', year: 2025, resolution: 30, minFiles: 2937 }, // 2997 files, 5.28 TB
	{ name: 'us/texas', code: 'tx', year: 2024, resolution: 60, minFiles: 16922 }, // 17268 files, 7.87 TB
	{ name: 'us/utah', code: 'ut', year: 2024, resolution: 60, minFiles: 5909 }, // 6030 files, 2.46 TB
	{ name: 'us/vermont', code: 'vt', year: 2025, resolution: 30, minFiles: 795 }, // 812 files, 1.35 TB
	{ name: 'us/virginia', code: 'va', year: 2025, resolution: 30, minFiles: 2970 }, // 3031 files, 3.97 TB
	{ name: 'us/washington', code: 'wa', year: 2023, resolution: 60, minFiles: 5605 }, // 5720 files, 2.25 TB
	{ name: 'us/west_virginia', code: 'wv', year: 2022, resolution: 60, minFiles: 1794 }, // 1831 files, 0.88 TB
	{ name: 'us/wisconsin', code: 'wi', year: 2024, resolution: 60, minFiles: 4394 }, // 4484 files, 1.79 TB
	{ name: 'us/wyoming', code: 'wy', year: 2024, resolution: 60, minFiles: 7209 }, // 7357 files, 2.65 TB
];
