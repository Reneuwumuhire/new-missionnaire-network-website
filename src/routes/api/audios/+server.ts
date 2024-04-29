import { parseSearchParams } from "@mnlib/lib/utils/url";
import SearchAudiosUsecase, { SearchAudioUsecaseArgsSchema } from "@mnlib/lib/usecase/search-audios";
import { json } from "@sveltejs/kit";


export async function GET({ url }) {

	const params = parseSearchParams(url) as any;
	const { searchTags } = params;
	if (searchTags) {
		params["searchTags"] = searchTags.split(",");
	}
	const usecase = new SearchAudiosUsecase();
	const res = await usecase.execute(SearchAudioUsecaseArgsSchema.parse(params));

	return json(res);
}
