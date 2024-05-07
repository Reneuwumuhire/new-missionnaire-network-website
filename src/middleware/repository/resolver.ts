import { ZodError, ZodType, z } from 'zod';
import { Result } from '@badrap/result';
import type { Methods } from './repo';
import ApiRepository from './repo';

const api = new ApiRepository();

const resolver = async <T>(
	url: URL,
	method: Methods,
	requestBody?: { [key: string]: any },
	schema?: ZodType<T>
): Promise<Result<T, Error>> => {
	try {
		const res = await api.request(url, method, requestBody);
		const data = res.data ?? res;
		return !schema ? Result.ok(data) : Result.ok(schema.parse(data));
	} catch (error) {
		let message = 'failed';
		if (error instanceof ZodError) {
			message = error.issues.map((e) => `${e.path}: ${e.message}`).join(', ');
		} else if (error instanceof Error) {
			message = error.message;
		}
		return Result.err(new Error(message));
	}
};
export default resolver;
