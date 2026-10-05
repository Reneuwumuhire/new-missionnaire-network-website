import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const id = encodeURIComponent(params.id);
	redirect(303, `/publications?post=${id}#${id}`);
};
