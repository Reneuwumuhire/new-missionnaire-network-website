/** @type {import('./$types').PageLoad} */

export function load({ params }: any) {
	// return the list of predications if no slug is provided else return the predications of the slug
	const { slug } = params;
	if (!slug) {
		return {
			body: {
				params
			}
		};
	}
	// return where slug is tous

	return {
		body: {
			params
		}
	};
}
