export function transcriptTitle(filename: string) {
	const label = filename
		.normalize('NFC')
		.replace(/\.pdf$/i, '')
		.replace(/\s+/g, ' ')
		.trim();
	const recordingStart = label.search(/\s+[-–—]\s+(?=prédication\s+d(?:e\b|['’]))/i);
	const heading = recordingStart > 0 ? label.slice(0, recordingStart) : label;
	const title = heading.replace(/\p{L}+(?:['’]\p{L}+)*/gu, (word) =>
		word === word.toLocaleUpperCase('fr')
			? word[0] +
				word
					.slice(1)
					.toLocaleLowerCase('fr')
					.replace(
						/^(['’])(\p{L})/u,
						(_, apostrophe, letter: string) => apostrophe + letter.toLocaleUpperCase('fr')
					)
			: word
	);
	const recordingDetails =
		recordingStart > 0 ? label.slice(recordingStart).trim().slice(1).trim() : '';
	return { title, recordingDetails };
}
