export const publicHymnFilter = {
	_id: { $type: 'objectId' as const },
	title: { $type: 'string' as const, $regex: /\S/ },
	s3_url: { $type: 'string' as const, $regex: /^https?:\/\//i }
};
