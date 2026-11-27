export const publicLiteratureFilter = {
	_id: { $type: 'objectId' as const },
	title: { $type: 'string' as const, $regex: /\S/ },
	$or: [{ pdf_url: { $regex: /^https?:\/\//i } }, { 'parts.url': { $regex: /^https?:\/\//i } }]
};
