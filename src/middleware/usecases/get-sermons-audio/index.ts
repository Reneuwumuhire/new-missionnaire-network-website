import { Result } from '@badrap/result';
import type { UseCase } from '..';
import { InternalFailure } from '../../errors/failures';
import resolver from '../../repository/resolver';
import { z } from 'zod';
import { URLInstance } from '../../repository/repo';
import type { ArgsToGetAudios, ArgsToGetVideos } from '../../entity';
import {  type YoutubeAudio, YoutubeAudioSchema } from '@mnlib/lib/models/youtube';

export default class GetSermonsAudioUsecase implements UseCase<ArgsToGetAudios, YoutubeAudio[]> {
	async execute({
		audioCount,
		startAfter
	}: ArgsToGetAudios): Promise<Result<YoutubeAudio[], InternalFailure>> {
		try {
			const url = URLInstance;
			url.pathname = `/api/yt/audios`;
			url.searchParams.set('type', 'predication');
			url.searchParams.set('maxResults', audioCount.toString());
			if (startAfter) url.searchParams.set('startAfter', startAfter.toString());

			const res = await resolver(url, 'GET', undefined, z.array(YoutubeAudioSchema));

			if (res.isOk) {
				return Result.ok(res.value);
			} else throw new Error(res.error.message);
		} catch (error) {
			return Result.err(new InternalFailure('Failed to get sermons'));
		}
	}
}
