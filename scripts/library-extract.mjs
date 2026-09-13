import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSrt } from '../src/lib/utils/srt.ts';

const maxBytes = 30 * 1024 * 1024;

async function download(rawUrl, allowedHosts) {
	const url = new URL(rawUrl);
	if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.has(url.host))
		throw new Error('Asset host is not allowed');
	const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
	if (!response.ok || !response.body) throw new Error(`Asset request failed (${response.status})`);
	if (Number(response.headers.get('content-length')) > maxBytes) {
		await response.body.cancel();
		throw new Error('Asset exceeds 30 MB');
	}
	const chunks = [];
	let bytes = 0;
	for await (const chunk of response.body) {
		bytes += chunk.length;
		if (bytes > maxBytes) throw new Error('Asset exceeds 30 MB');
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

export async function extract(url, kind, allowedHosts) {
	const bytes = await download(url, allowedHosts);
	let parts = [];
	if (kind === 'srt') {
		parts = parseSrt(bytes.toString('utf8')).map((cue) => ({
			text: cue.text,
			startMs: cue.startMs
		}));
	} else {
		// Maintenance uses the Node build; the passage reader lazy-loads the browser build.
		const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
		const task = getDocument({
			data: new Uint8Array(bytes),
			standardFontDataUrl: join(
				dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'))),
				'standard_fonts/'
			),
			isEvalSupported: false,
			useSystemFonts: false
		});
		try {
			const pdf = await task.promise;
			if (pdf.numPages > 500) throw new Error('PDF exceeds 500 pages');
			for (let number = 1; number <= pdf.numPages; number++) {
				const page = await pdf.getPage(number);
				const content = await page.getTextContent();
				parts.push({
					text: content.items.map((item) => ('str' in item ? item.str : '')).join(' '),
					page: number
				});
				page.cleanup();
			}
		} finally {
			await task.destroy();
		}
	}
	parts = parts
		.map((part) => ({
			...part,
			text: part.text
				.replace(/<[^>]*>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
		}))
		.filter((part) => part.text);
	if (Buffer.byteLength(JSON.stringify(parts)) > 2 * 1024 * 1024)
		throw new Error('Extracted text exceeds 2 MB');
	return { url, parts, indexed_at: new Date() };
}
