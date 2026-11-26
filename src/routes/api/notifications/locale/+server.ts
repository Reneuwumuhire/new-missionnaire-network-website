import { json } from '@sveltejs/kit';

export function GET({ cookies }) {
	return json({ locale: cookies.get('mn_locale') === 'en' ? 'en' : 'fr' });
}
