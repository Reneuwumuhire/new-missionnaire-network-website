import type { z } from 'zod';

export function parseSearchParams<T>(url: URL, schema?: z.ZodType<T>): T | Record<string, string> {
	const params = Object.fromEntries(url.searchParams.entries());
	return schema?.parse(params) ?? params;
}
