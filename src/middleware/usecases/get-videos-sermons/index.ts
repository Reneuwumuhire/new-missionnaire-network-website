import { Result } from '@badrap/result';
import type { UseCase } from '..';
import { InternalFailure } from '../../errors/failures';
import resolver from '../../repository/resolver';
import { z } from 'zod';
import { URLInstance } from '../../repository/repo';
import type { ArgsToGetSermonVideos } from '../../entity';
import { YoutubeVideoSchema, type YoutubeVideo } from '@mnlib/lib/models/youtube';

export default class GetSermonsVideosUsecase implements UseCase<ArgsToGetSermonVideos, YoutubeVideo[]> {
	async execute({
		videoCount,
		pageNumber,
		type
	}: ArgsToGetSermonVideos): Promise<Result<YoutubeVideo[], InternalFailure>> {
		try {
			// GET /api/yt/videos/query?searchTags=branham,frank&limit=5&pageNumber=1
			if(!pageNumber) pageNumber = 1;
			const url = URLInstance;
			url.pathname = `/api/yt/videos/query`;
			url.searchParams.set('searchTags', type.join(","));
			url.searchParams.set('limit', videoCount.toString());
			url.searchParams.set('pageNumber', pageNumber.toString());

			const res = await resolver(url, 'GET', undefined, z.array(YoutubeVideoSchema));

			if (res.isOk) {
				return Result.ok(res.value);
			} else throw new Error(res.error.message);
		} catch (error) {
			return Result.err(new InternalFailure('Failed to get Videos from server'));
		}
	}
}
