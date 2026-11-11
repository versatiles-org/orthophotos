/**
 * Parses the progress output of `gdal` and `osmium` into a percentage.
 *
 * - `gdal` writes `0...10...20...` … `100 - done.` to stdout: a number every 10 %, a dot every 2.5 %.
 * - `osmium --progress` redraws `[====>   ]  45% ` on stderr, separated by `\r`.
 *
 * Output can arrive split at any character, so both parsers keep state between chunks.
 */

export type ProgressParser = (stream: 'stdout' | 'stderr', chunk: string) => number | undefined;

/** Returns a parser for the given command, or `undefined` if it reports no progress we understand. */
export function createProgressParser(cmd: string): ProgressParser | undefined {
	if (cmd === 'gdal') return createGdalParser();
	if (cmd === 'osmium') return createOsmiumParser();
	return undefined;
}

/** The non-empty lines of a tool's stderr, without osmium's progress bar redraws. */
export function stripProgress(stderr: string): string[] {
	return stderr
		.split(/[\r\n]+/)
		.map((line) => line.trim())
		.filter((line) => line !== '' && !/^\[[= >]*\]\s*\d{1,3}%$/.test(line));
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

function createOsmiumParser(): ProgressParser {
	let percent = 0;
	let carry = '';

	return (stream, chunk) => {
		if (stream !== 'stderr') return undefined;
		const text = carry + chunk;
		carry = text.slice(-8);
		const matches = [...text.matchAll(/(\d{1,3})%/g)];
		const last = matches.at(-1);
		if (!last) return undefined;
		const value = Math.min(100, Number(last[1]));
		if (value <= percent) return undefined;
		percent = value;
		return percent;
	};
}
