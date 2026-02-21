import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findSermonByIdentifier } from '$lib/server/sermonByIdentifier';
import { buildSermonSlug } from '../../../../utils/sermonSlug';

function normalizePdfUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function selectPdfUrl(
	frenchPdfUrl: string | null,
	englishPdfUrl: string | null,
	langParam: string | null
): string | null {
	const lang = (langParam || '').toLowerCase();

	if (lang.startsWith('en')) {
		return englishPdfUrl || frenchPdfUrl;
	}

	return frenchPdfUrl || englishPdfUrl;
}

function toInlineFilename(slug: string): string {
	const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').replace(/-{2,}/g, '-');
	return `${safeSlug || 'predication'}.pdf`;
}

export const GET: RequestHandler = async ({ params, url, fetch }) => {
	const identifier = params.slug;
	const sermon = await findSermonByIdentifier(identifier);

	if (!sermon) {
		throw error(404, 'Prédication introuvable');
	}

	const canonicalSlug = buildSermonSlug(sermon);
	if (!canonicalSlug) {
		throw error(404, 'URL de prédication invalide');
	}

	if (identifier.toLowerCase() !== canonicalSlug.toLowerCase()) {
		throw redirect(301, `/predications/${canonicalSlug}/pdf${url.search}`);
	}

	const frenchPdfUrl = normalizePdfUrl(sermon.pdf_url);
	const englishPdfUrl = normalizePdfUrl(sermon.english_pdf_url);
	const pdfUrl = selectPdfUrl(frenchPdfUrl, englishPdfUrl, url.searchParams.get('lang'));

	if (!pdfUrl) {
		throw error(404, 'PDF introuvable');
	}

	let upstreamResponse: Response;
	try {
		upstreamResponse = await fetch(pdfUrl, {
			headers: {
				accept: 'application/pdf,*/*;q=0.8'
			}
		});
	} catch {
		throw error(502, 'Impossible de charger le PDF');
	}

	if (!upstreamResponse.ok || !upstreamResponse.body) {
		throw error(502, 'Le serveur PDF a renvoyé une erreur');
	}

	const headers = new Headers();
	const upstreamType = upstreamResponse.headers.get('content-type') || '';
	headers.set('content-type', upstreamType.toLowerCase().includes('pdf') ? upstreamType : 'application/pdf');
	headers.set('content-disposition', `inline; filename="${toInlineFilename(canonicalSlug)}"`);
	headers.set('cache-control', 'public, max-age=3600, stale-while-revalidate=86400');

	const contentLength = upstreamResponse.headers.get('content-length');
	if (contentLength) {
		headers.set('content-length', contentLength);
	}

	return new Response(upstreamResponse.body, {
		status: 200,
		headers
	});
};
