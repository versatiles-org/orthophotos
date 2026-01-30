/** Character mapping for converting special characters to ASCII equivalents */
const CHAR_MAP = new Map<string, string>([
	// Punctuation/symbols -> space
	['-', ' '],
	['—', ' '],
	[',', ' '],
	['.', ' '],
	['\u2019', ' '],
	['(', ' '],
	[')', ' '],
	['/', ' '],
	// Combining dot above -> empty
	['̇', ''],
	// Accented A variants
	['á', 'a'],
	['à', 'a'],
	['ă', 'a'],
	['â', 'a'],
	['å', 'a'],
	['ã', 'a'],
	['ą', 'a'],
	['ä', 'ae'],
	['æ', 'ae'],
	// Accented C variants
	['ć', 'c'],
	['č', 'c'],
	['ç', 'c'],
	// Accented D variants
	['đ', 'd'],
	['ð', 'd'],
	// Accented E variants
	['é', 'e'],
	['è', 'e'],
	['ê', 'e'],
	['ě', 'e'],
	['ë', 'e'],
	['ė', 'e'],
	['ę', 'e'],
	['ē', 'e'],
	// Accented G variants
	['ğ', 'g'],
	['ģ', 'g'],
	// Accented H variants
	['ħ', 'h'],
	// Accented I variants
	['í', 'i'],
	['ì', 'i'],
	['î', 'i'],
	['ï', 'i'],
	['ī', 'i'],
	['ı', 'i'],
	// Accented K variants
	['ķ', 'k'],
	// Accented L variants
	['ł', 'l'],
	// Accented N variants
	['ń', 'n'],
	['ň', 'n'],
	['ñ', 'n'],
	// Accented O variants
	['ó', 'o'],
	['ô', 'o'],
	['ő', 'o'],
	['õ', 'o'],
	['ø', 'o'],
	['ö', 'oe'],
	// Accented R variants
	['ř', 'r'],
	// Accented S variants
	['ś', 's'],
	['š', 's'],
	['ş', 's'],
	['ß', 'ss'],
	// Accented T variants
	['ţ', 't'],
	// Accented U variants
	['ú', 'u'],
	['ů', 'u'],
	['ų', 'u'],
	['ü', 'ue'],
	// Accented Y variants
	['ý', 'y'],
	// Accented Z variants
	['ź', 'z'],
	['ž', 'z'],
	['ż', 'z'],
]);

/**
 * Converts a string to ASCII by replacing special characters.
 * Spaces and hyphens become underscores, accented characters are normalized.
 */
export function string2ascii(s: string): string {
	const originalString = s;
	s = s.toLowerCase().replaceAll(/[^a-z ]/g, (c) => {
		const replacement = CHAR_MAP.get(c);
		if (replacement === undefined) {
			throw new Error(`Unsupported character '${c}' in region id "${originalString}"`);
		}
		return replacement;
	});
	s = s.trim().replaceAll(/\s+/g, '_');
	return s;
}
