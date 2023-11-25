/** @type {import('./$types').PageLoad} */
import { PredicationsRoutes } from './predicationsRoutesList';

export function load({ params }: any) {
	// return the list of predications if no slug is provided else return the predications of the slug
	const { slug } = params;
	if (!slug) {
		return {
			body: {
				params,
				PredicationsRoutes
			}
		};
	}
	const predications = PredicationsRoutes.find((p) => p.slug === slug);
	// return where slug is tous
	const predicationTous = PredicationsRoutes.find((p) => p.slug === 'tous');

	if (!predications) {
		return {
			body: {
				params,
				predicationTous
			}
		};
	}
	return {
		body: {
			params,
			...predications
		}
	};
}
