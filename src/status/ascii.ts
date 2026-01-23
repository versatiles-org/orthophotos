export function string2ascii(s: string): string {
	s = s.toLowerCase().replaceAll(/[^a-z ]/g, (c) => {
		switch (c) {
			case '-':
				return ' ';
			case '—':
				return ' ';
			case ',':
				return ' ';
			case '.':
				return ' ';
			case '̇':
				return '';
			case '’':
				return ' ';
			case '(':
				return ' ';
			case ')':
				return ' ';
			case '/':
				return ' ';
			case 'á':
				return 'a';
			case 'à':
				return 'a';
			case 'ă':
				return 'a';
			case 'â':
				return 'a';
			case 'å':
				return 'a';
			case 'ã':
				return 'a';
			case 'ą':
				return 'a';
			case 'ä':
				return 'ae';
			case 'æ':
				return 'ae';
			case 'ć':
				return 'c';
			case 'č':
				return 'c';
			case 'ç':
				return 'c';
			case 'đ':
				return 'd';
			case 'ð':
				return 'd';
			case 'é':
				return 'e';
			case 'è':
				return 'e';
			case 'ê':
				return 'e';
			case 'ě':
				return 'e';
			case 'ë':
				return 'e';
			case 'ė':
				return 'e';
			case 'ę':
				return 'e';
			case 'ē':
				return 'e';
			case 'ğ':
				return 'g';
			case 'ģ':
				return 'g';
			case 'ħ':
				return 'h';
			case 'í':
				return 'i';
			case 'ì':
				return 'i';
			case 'î':
				return 'i';
			case 'ï':
				return 'i';
			case 'ī':
				return 'i';
			case 'ı':
				return 'i';
			case 'ķ':
				return 'k';
			case 'ł':
				return 'l';
			case 'ń':
				return 'n';
			case 'ň':
				return 'n';
			case 'ñ':
				return 'n';
			case 'ó':
				return 'o';
			case 'ô':
				return 'o';
			case 'ő':
				return 'o';
			case 'õ':
				return 'o';
			case 'ø':
				return 'o';
			case 'ö':
				return 'oe';
			case 'ř':
				return 'r';
			case 'ś':
				return 's';
			case 'š':
				return 's';
			case 'ş':
				return 's';
			case 'ß':
				return 'ss';
			case 'ţ':
				return 't';
			case 'ú':
				return 'u';
			case 'ů':
				return 'u';
			case 'ų':
				return 'u';
			case 'ü':
				return 'ue';
			case 'ý':
				return 'y';
			case 'ź':
				return 'z';
			case 'ž':
				return 'z';
			case 'ż':
				return 'z';
			default:
				throw new Error(`Unsupported character '${c}' in region id "${s}"`);
		}
	});
	s = s.trim().replaceAll(/\s+/g, '_');
	return s;
}
