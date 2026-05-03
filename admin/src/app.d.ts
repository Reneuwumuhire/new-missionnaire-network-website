import type { AdminUser } from '$lib/models/admin-user';

declare global {
	namespace App {
		interface Locals {
			user: AdminUser;
		}
	}
}

/** Vite ?raw imports — file content as a string. Used by lyricsReview.ts
 *  to bundle lyrics-matches.csv at build time so it's available on
 *  read-only serverless function filesystems (Vercel). */
declare module '*?raw' {
	const content: string;
	export default content;
}

export {};
