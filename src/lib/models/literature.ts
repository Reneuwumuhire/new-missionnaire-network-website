import { z } from 'zod';

export const LiteraturePartSchema = z.object({
	title: z.string(),
	code: z.string().optional(),
	url: z.string().url(),
	position: z.number().int().positive()
});

export const LiteratureSchema = z.object({
	_id: z.string().optional(),
	title: z.string().nullable(),
	author: z.string(),
	type: z.string(), // "Lettre Circulaire" or "Books"
	language: z.string().optional().default('french'),
	pdf_url: z.string().url().nullable().optional(),
	parts: z.array(LiteraturePartSchema).optional().default([]),
	cover_url: z.string().optional(),
	description: z.string().optional(),
	source: z.string().optional(),
	release_date: z
		.union([z.instanceof(Date), z.string()])
		.optional()
		.transform((val) => (val ? new Date(val).toISOString() : undefined)),
	updated_at: z.string().optional()
});

export type Literature = z.infer<typeof LiteratureSchema>;
