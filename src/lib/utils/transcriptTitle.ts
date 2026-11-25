export function transcriptTitle(filename: string) {
	const label = filename
		.normalize('NFC')
		.replace(/\.pdf$/i, '')
		.replace(/\s+/g, ' ')
		.trim();
	const heading = label.replace(/^\d{4}-\d{2}-\d{2}\s+(?:[-–—]\s+)?(?=\S)/, '');
	const recordingStart = heading.search(/\s+[-–—]\s+(?=prédication\s+d(?:e\b|['’]))/i);
	const title = recordingStart > 0 ? heading.slice(0, recordingStart) : heading;
	const recordingDetails =
		recordingStart > 0 ? heading.slice(recordingStart).trim().slice(1).trim() : '';
	return { title, recordingDetails };
}
