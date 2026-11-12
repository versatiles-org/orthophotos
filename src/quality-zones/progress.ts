/**
 * Parses the progress output of `gdal` and `versatiles` into a percentage.
 *
 * - `gdal` writes `0...10...20...` … `100 - done.` to stdout: a number every 10 %, a dot every 2.5 %.
 * - `versatiles dev measure-tile-sizes` redraws two bars on stderr, separated by `\r`: first
 *   `reading the tile index▕…▏307/307 (100%)`, then `Scanning tile sizes▕…▏12/268435456 (  0%)`.
 *   Only the second one is the step's progress.
 *
 * Output can arrive split at any character, so both parsers keep state between chunks.
 */

export type ProgressParser = (stream: 'stdout' | 'stderr', chunk: string) => number | undefined;

/** Returns a parser for the given command, or `undefined` if it reports no progress we understand. */
export function createProgressParser(cmd: string): ProgressParser | undefined {
	if (cmd === 'gdal') return createGdalParser();
	if (cmd === 'versatiles') return createVersatilesParser();
	return undefined;
}

// Terminal escapes in versatiles' output: "clear line" (CSI 2K) and the OSC 9;4 tab progress.
const ESCAPES = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

// A redraw of a versatiles progress bar, once escapes are removed.
const BAR = /\(\s*\d{1,3}%\)/;

/** The non-empty lines of a tool's stderr, without terminal escapes and progress bar redraws. */
export function stripProgress(stderr: string): string[] {
	return stderr
		.replace(ESCAPES, '')
		.split(/[\r\n]+/)
		.map((line) => line.trim())
		.filter((line) => line !== '' && !BAR.test(line));
}

function createGdalParser(): ProgressParser {
	let percent = 0;
	let digits = '';
	let finished = false;

	return (stream, chunk) => {
		if (stream !== 'stdout' || finished) return undefined;
		const before = percent;
		for (const char of chunk) {
			if (char >= '0' && char <= '9') {
				digits += char;
				continue;
			}
			if (digits) {
				percent = Math.max(percent, Math.min(100, Number(digits)));
				digits = '';
			}
			if (char === '.') {
				percent = Math.min(100, percent + 2.5);
			} else if (char === ' ' && percent === 100) {
				// "100 - done." follows; its dot is not progress.
				finished = true;
				break;
			}
		}
		return percent === before ? undefined : percent;
	};
}

function createVersatilesParser(): ProgressParser {
	let percent = 0;
	let carry = '';

	return (stream, chunk) => {
		if (stream !== 'stderr') return undefined;
		// Keep the unfinished redraw for the next chunk; a complete one ends where the next "\r" starts.
		const text = carry + chunk;
		const lastStart = text.lastIndexOf('\r');
		carry = lastStart >= 0 ? text.slice(lastStart) : text;
		let found: number | undefined;
		for (const redraw of text.replace(ESCAPES, '').split('\r')) {
			const match = /^Scanning tile sizes.*\(\s*(\d{1,3})%\)/.exec(redraw.trim());
			if (match) found = Math.min(100, Number(match[1]));
		}
		if (found === undefined || found <= percent) return undefined;
		percent = found;
		return percent;
	};
}
