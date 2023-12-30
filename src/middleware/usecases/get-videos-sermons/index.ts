import { Result } from '@badrap/result';
import type { UseCase } from '..';
import { InternalFailure } from '../../errors/failures';
import resolver from '../../repository/resolver';
import { z } from 'zod';
import { URLInstance } from '../../repository/repo';
import type { ArgsToGetVideos } from '../../entity';
import { YoutubeVideoSchema, type YoutubeVideo } from '@mnlib/lib/models/youtube';

export default class GetSermonsVideosUsecase implements UseCase<ArgsToGetVideos, YoutubeVideo[]> {
	async execute({
		videoCount,
		startAfter
	}: ArgsToGetVideos): Promise<Result<YoutubeVideo[], InternalFailure>> {
		try {
			const url = URLInstance;
			url.pathname = `/api/yt/videos`;
			url.searchParams.set('type', 'predication');
			url.searchParams.set('maxResults', videoCount.toString());
			if (startAfter) url.searchParams.set('startAfter', startAfter.toString());

			const res = await resolver(url, 'GET', undefined, z.array(YoutubeVideoSchema));

			if (res.isOk) {
				return Result.ok(res.value);
			} else throw new Error(res.error.message);
		} catch (error) {
			return Result.err(new InternalFailure('Failed to get Videos from server'));
		}
	}
}
