import { parseSearchParams } from '@mnlib/lib/utils/url';
import SearchAudiosUsecase, {
	SearchAudioUsecaseArgsSchema
} from '@mnlib/lib/usecase/search-audios';
import { json } from '@sveltejs/kit';
import { ZodError } from 'zod';

export async function GET({ url }) {
	try {
		const params = parseSearchParams(url) as any;
		const { searchTags } = params;
		if (searchTags) {
			params['searchTags'] = searchTags.split(',');
		}
		const usecase = new SearchAudiosUsecase();
		const res = await usecase.execute(SearchAudioUsecaseArgsSchema.parse(params));
		const data = res.ok ? res.value : [];
		const error = !res.ok ? res.error.message : null;
		return json({
			data,
			error
		});
	} catch (e) {
		let error = new Error('Invalid parameters');
		if (e instanceof ZodError) {
			error = new Error(e.issues.map((i) => `${i.code}: ${i.message}`).join(', '));
		} else if (e instanceof Error) {
			error = e;
		}
		return json({
			ok: false,
			error: error.message
		});
  }
}
