const ACCENT_MAP: Record<string, string[]> = {
	a: ['a', 'à', 'â', 'ä', 'á', 'ã', 'å'],
	e: ['e', 'è', 'é', 'ê', 'ë'],
	i: ['i', 'ì', 'í', 'î', 'ï'],
	o: ['o', 'ò', 'ó', 'ô', 'õ', 'ö'],
	u: ['u', 'ù', 'ú', 'û', 'ü'],
	c: ['c', 'ç'],
	n: ['n', 'ñ'],
	y: ['y', 'ý', 'ÿ']
};
const OPT_COMBINING = '[\u0300-\u036f]?';

/** Shared with music search: literal, accent-tolerant matching, never raw user regex. */
export function buildFuzzySearchPattern(search: string): string {
	const normalized = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
	let pattern = '';
	for (const char of normalized) {
		const lower = char.toLowerCase();
		if (lower in ACCENT_MAP) pattern += '(?:' + ACCENT_MAP[lower].join('|') + ')' + OPT_COMBINING;
		else if (/[a-z]/i.test(char))
			pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + OPT_COMBINING;
		else if (/[0-9]/.test(char)) pattern += char;
		else if (char === "'" || char === '\u2019' || char === '\u2018') pattern += "['ʼ\u2018\u2019]?";
		else if (char === ' ') pattern += '[\\s\\-]?';
		else pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
	return pattern;
}
