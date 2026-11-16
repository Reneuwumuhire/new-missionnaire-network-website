import { z } from 'zod';

export const objectIdString = z.string().regex(/^[a-f\d]{24}$/i);
export const searchText = z.string().trim().max(250);
export const literalSearch = searchText.transform((value) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

export const pageLimit = z.int().min(1).max(1000);
export const pageNumber = z.int().min(1).max(100_000);
