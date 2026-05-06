import { chmodSync, existsSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
	defineTileRegion,
	extractZipAndBuildVrt,
	isValidRaster,
	runCommand,
	runMosaicTile,
	withRetry,
} from '../lib/index.ts';

const FTP_HOST = 'ftp.dataforsyningen.dk';
const FTP_DIR = '/grundlaeggende_landkortdata/ortofoto/12_5CM/';
const FTP_USER = 'versatiles2';
// Note: this password is intentionally not kept secret, as anyone can register for their own credentials at https://dataforsyningen.dk/data/981.
// Open data should be accessible without secret credentials, but in this case the provider requires registration to access the data, so we provide a shared account for convenience.
const FTP_PASS = 'tuzryq-8haxka-vivziH';

/**
 * Writes a netrc file (mode 0600) into `tempDir` so curl can authenticate with
 * the FTPS server without putting credentials on the command line. Credentials
 * come from `dk_ftp_user` / `dk_ftp_pass` in config.env (both gitignored).
 */
function ensureNetrc(tempDir: string): string {
	const netrcPath = join(tempDir, '.netrc');
	const contents = `machine ${FTP_HOST}\nlogin ${FTP_USER}\npassword ${FTP_PASS}\n`;
	if (!existsSync(netrcPath)) {
		writeFileSync(netrcPath, contents);
		chmodSync(netrcPath, 0o600);
	}
	return netrcPath;
}

/** Lists remote filenames in a directory via `curl --list-only`. */
async function ftpList(netrc: string, remoteDir: string): Promise<string[]> {
	const url = `ftps://${FTP_HOST}${remoteDir.endsWith('/') ? remoteDir : remoteDir + '/'}`;
	const result = await runCommand('curl', ['-s', '--ssl-reqd', '--netrc-file', netrc, '--list-only', '--fail', url], {
		quiet: true,
	});
	return new TextDecoder()
		.decode(result.stdout)
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s.length > 0 && s !== '.' && s !== '..');
}

/** Atomic FTPS download via curl: writes to `${dest}.tmp` then renames. */
async function ftpDownload(netrc: string, remotePath: string, dest: string): Promise<void> {
	const tmp = `${dest}.tmp`;
	const url = `ftps://${FTP_HOST}${remotePath}`;
	await runCommand('curl', ['-sL', '--ssl-reqd', '--netrc-file', netrc, '--fail', '-o', tmp, url]);
	renameSync(tmp, dest);
}

interface DkItem {
	id: string;
	filename: string;
}

export default defineTileRegion<DkItem, { zipPath: string }>({
	name: 'dk',
	meta: {
		status: 'released',
		notes: [
			'Forårs ortofoto 2025, 12.5 cm, via FTPS (dataforsyningen.dk/data/981).',
			'Credentials required — set dk_ftp_user and dk_ftp_pass in config.env.',
			'License requires attribution to GeoDanmark.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoDanmark',
			url: 'https://dataforsyningen.dk/data/981',
		},
		date: '2025',
		releaseDate: '2026-04-27',
		mask: true,
	},
	init: async (ctx) => {
		const netrc = ensureNetrc(ctx.tempDir);
		console.log(`  Listing ftps://${FTP_HOST}${FTP_DIR}...`);
		const names = await withRetry(() => ftpList(netrc, FTP_DIR), { maxAttempts: 3 });
		const zips = names.filter((n) => /\.zip$/i.test(n));
		if (zips.length === 0) {
			throw new Error(`No .zip files found in ${FTP_DIR} (saw ${names.length} entries).`);
		}
		console.log(`  ${zips.length} orthophoto archives listed`);
		// Strip the common '_TIF_UTM32-ETRS89.zip' suffix so output filenames are readable
		// (e.g. '10km_2025_607_62.versatiles'). Falls back to the full basename if absent.
		return zips.map((filename) => ({
			id: filename.replace(/(?:_TIF_UTM32-ETRS89)?\.zip$/i, ''),
			filename,
		}));
	},
	// FTPS connections are sequential — the server limits parallel sessions per account.
	downloadLimit: 1,
	download: async (item, ctx) => {
		const netrc = ensureNetrc(ctx.tempDir);
		const zipPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.zip`));
		await withRetry(() => ftpDownload(netrc, FTP_DIR + item.filename, zipPath), { maxAttempts: 3 });
		return { zipPath };
	},
	// Each VRT fans out to many per-tile GDAL readers; running more than one at a time can swamp the machine.
	convertLimit: 1,
	convert: async ({ zipPath }, ctx) => {
		const baseId = basename(zipPath, '.zip');
		const extractDir = ctx.tempFile(join(ctx.tempDir, `${baseId}_extract`));
		const vrtPath = join(extractDir, 'mosaic.vrt');

		// Archives hold many TIFFs per 10km cell — always mosaic them through a VRT
		// so versatiles sees a single continuous raster.
		const { fileCount } = await extractZipAndBuildVrt(zipPath, extractDir, vrtPath);
		if (fileCount === 0) {
			ctx.errors.add(`${baseId}.zip (no .tif inside)`);
			return;
		}

		if (!(await isValidRaster(vrtPath))) {
			ctx.errors.add(`${baseId}.zip (invalid raster)`);
			return;
		}

		// Danish orthophoto grid is ETRS89 / UTM zone 32N. Cap GDAL concurrency
		// to 2 — the VRT fans out to many per-tile GDAL readers and can swamp
		// the machine otherwise.
		await runMosaicTile(vrtPath, ctx.dest, { crs: '25832', gdalConcurrency: 2 });
	},
	// Denmark is ~43k km²; a 10km grid maxes at ~430 tiles but many are water/outside.
	// Bump this once the first full run gives a concrete count.
	minFiles: 300,
});
