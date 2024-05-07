import { Result } from '@badrap/result';
import type { UseCase } from '..';
import { InternalFailure } from '../../errors/failures';
import { type AudioAsset, AudioAssetSchema } from '@mnlib/lib/models/media-assets';
import type { SearchAudioUsecaseArgs } from '@mnlib/lib/usecase/search-audios';
import { PUBLIC_MAIN_URL } from '$env/static/public';

export type GetSermonArgsType = {
	params: Partial<SearchAudioUsecaseArgs>;
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};
export default class GetSermonsAudioUsecase implements UseCase<GetSermonArgsType, AudioAsset[]> {
	async execute({
		params,
		fetch
	}: GetSermonArgsType): Promise<Result<AudioAsset[], InternalFailure>> {
		try {
			const url = new URL(`api/audios`, PUBLIC_MAIN_URL);
			Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value.toString()));
			const results = await fetch(url.toString());
			const jsonData = await results.json();
			if (jsonData.error) return Result.err(new InternalFailure(jsonData.error));
			const data = AudioAssetSchema.array().parse(jsonData.data);
			return Result.ok(data as AudioAsset[]);
		} catch (error) {
			return Result.err(new InternalFailure('Failed to get sermons'));
		}
	}
}
