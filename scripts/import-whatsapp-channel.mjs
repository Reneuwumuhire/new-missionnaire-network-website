import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputFile = resolve(root, 'src/lib/data/channelPosts.json');
const imageDirectory = resolve(root, 'static/img/extraits');
const channelUrl = 'https://whatsapp.com/channel/0029VbC7KvqEVccBdAOEYp1I';
const firstSealPdf =
	'https://missionnaire-bucket.s3.af-south-1.amazonaws.com/sermons/1963/03/Le%20Premier%20Sceau%20-%201963-03-18.pdf';

const sources = {
	'7feca409be2c': zurich1991(),
	'622a3f5dc102': zurich1991(),
	d775bbfca153: firstSeal(),
	d89a4a123b14: krefeld1991(),
	'8f9133bd1b0a': krefeld1991(),
	f56804bc6516: krefeld1991(),
	e94395921a66: zurich2023()
};

function zurich1991() {
	return {
		title: 'Réunion de Zurich — 29 septembre 1991',
		links: [
			{
				label: 'Écouter et lire la transcription',
				href: '/live/rediffusions/6a93e3ee3dcc0e98ad7e724b',
				kind: 'live'
			},
			{ label: 'Voir la vidéo', href: '/videos?v=_nbIC6dM-Yg', kind: 'video' },
			{
				label: 'Lire le PDF',
				href: "https://missionnaire-bucket.s3.af-south-1.amazonaws.com/pdf/2026/08/2026-08-30%20%20%20%20%20LA%20GRANDE%20DIFFE%CC%81RENCE%20ENTRE%20MATTHIEU%20251-10%20ET%201%20THESSALONICIENS%20413-17%20-%20UNE%20VOIX%20EST%20%20ADRESSE%CC%81E%20AUX%20VIVANTS%20SUR%20LA%20TERRE%2C%20ET%20L'AUTRE%20AUX%20ENDORMIS%20DU%20CIEL%20!.pdf",
				kind: 'pdf'
			}
		]
	};
}

function firstSeal() {
	return {
		title: 'Le Premier Sceau — 18 mars 1963',
		links: [
			{
				label: 'Voir la prédication',
				href: '/predications/le-premier-sceau-63-0318',
				kind: 'sermon'
			},
			{ label: 'Lire le PDF', href: firstSealPdf, kind: 'pdf' },
			{
				label: 'Écouter l’audio',
				href: 'https://missionnaire-bucket.s3.af-south-1.amazonaws.com/sermons/1963/03/Le%20Premier%20Sceau%20-%201963-03-18.mp3',
				kind: 'audio'
			}
		]
	};
}

function krefeld1991() {
	return {
		title: 'Les mystères de Dieu — Krefeld, 5 octobre 1991',
		links: [
			{
				label: 'Écouter et lire la transcription',
				href: '/live/rediffusions/6aa58d0b1473609269a4fcaf',
				kind: 'live'
			},
			{ label: 'Voir la vidéo', href: '/videos?v=RGNm_LmanQs', kind: 'video' },
			{
				label: 'Lire le PDF',
				href: 'https://missionnaire-bucket.s3.af-south-1.amazonaws.com/pdf/2026/09/2026-09-12%20%20%20%20%20%20E%CC%81TUDE%20BIBLIQUESUR%20LES%20MYSTE%CC%80RES%20DE%20DIEU%20!%20(Premie%CC%80re%20partie)%20-%20Pre%CC%81dication%20de%20Fre%CC%80re%20Ewald%20Frank%20a%CC%80%20Krefeld%20-%20Le%205%20octobre%201991%20a%CC%80%2019h30%20%20Retransmise%20le%2012%20Septembre%202026%20a%CC%80%2019h30.pdf',
				kind: 'pdf'
			}
		]
	};
}

function zurich2023() {
	return {
		title: 'Réunion de Zurich — 24 septembre 2023',
		links: [
			{ label: 'Voir la vidéo', href: '/videos?v=gIwJOkZe_RE', kind: 'video' },
			{
				label: 'Lire le PDF',
				href: 'https://missionnaire-bucket.s3.af-south-1.amazonaws.com/pdf/2023/09/2023-09-24%20%20%20RE%CC%81UNION%20MENSUELLE%20DE%20ZURICH%20-%20par%20Ewald%20Frank.pdf',
				kind: 'pdf'
			}
		]
	};
}

function decodeEntities(text) {
	return text.replace(/&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi, (entity, dec, hex) => {
		if (dec) return String.fromCodePoint(Number(dec));
		if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
		return { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[
			entity.toLowerCase()
		];
	});
}

function escapeHtml(text) {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function sanitizeWhatsAppHtml(input) {
	const allowed = new Set(['strong', 'em', 'del', 'code']);
	const stack = [];
	let output = '';
	let cursor = 0;

	for (const match of input.matchAll(/<[^>]*>/g)) {
		output += escapeHtml(decodeEntities(input.slice(cursor, match.index))).replace(
			/\r?\n/g,
			'<br>'
		);
		const tag = match[0];
		const name = /^<\/?\s*([a-z\d]+)/i.exec(tag)?.[1]?.toLowerCase();

		if (name === 'img' && !/^<\s*\//.test(tag)) {
			const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
			if (alt) output += escapeHtml(decodeEntities(alt[1] ?? alt[2] ?? ''));
		} else if (name === 'br') {
			output += '<br>';
		} else if (name && allowed.has(name)) {
			if (/^<\s*\//.test(tag)) {
				const index = stack.lastIndexOf(name);
				if (index >= 0) {
					while (stack.length > index) output += `</${stack.pop()}>`;
				}
			} else {
				stack.push(name);
				output += `<${name}>`;
			}
		}
		cursor = match.index + tag.length;
	}

	output += escapeHtml(decodeEntities(input.slice(cursor))).replace(/\r?\n/g, '<br>');
	while (stack.length) output += `</${stack.pop()}>`;
	return output
		.replace(/(?:<br>\s*){3,}/g, '<br><br>')
		.replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '')
		.trim();
}

function publishedAt(pre) {
	const match = /\[(\d{1,2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/.exec(pre);
	if (!match) throw new Error(`Unrecognized WhatsApp date: ${pre}`);
	const [, hour, minute, month, day, year] = match;
	return new Date(
		`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+02:00`
	).toISOString();
}

function passageLink(text) {
	const paragraph = /^\s*🎧?\s*«?(33|38|41|80|96)\b/.exec(text)?.[1];
	const query = {
		33: 'le Livre a été préparé et écrit avant la fondation du monde',
		38: 'le Saint-Esprit est descendu directement dans la pièce',
		41: 'c’est le Premier Sceau Celui que nous allons essayer',
		80: 'Chaque croyant né de nouveau chaque vrai croyant',
		96: 'si huit cents personnes allaient dans l’Enlèvement ce soir'
	}[paragraph];
	if (!query) return null;
	const params = new URLSearchParams({ q: query, asset: firstSealPdf, language: 'fr' });
	return {
		label: 'Ouvrir le passage cité',
		href: `/lecture/sermons/69559f37df4b898626723fdd?${params}`,
		kind: 'passage'
	};
}

function normalizePost(post) {
	if (!/^[A-Z\d]+$/i.test(post.id ?? '')) throw new Error('Invalid WhatsApp message id');
	if (typeof post.text !== 'string' || typeof post.html !== 'string')
		throw new Error(`Post ${post.id} has no caption`);
	if (post.text.length > 50_000 || post.html.length > 100_000)
		throw new Error(`Post ${post.id} is unexpectedly large`);

	const media = /^data:image\/jpeg;base64,([a-z\d+/=]+)$/i.exec(post.media ?? '');
	if (!media) throw new Error(`Post ${post.id} has no JPEG image`);
	const bytes = Buffer.from(media[1], 'base64');
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
		throw new Error(`Post ${post.id} has invalid JPEG data`);
	const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
	const imageName = `${hash}.jpg`;
	writeFileSync(resolve(imageDirectory, imageName), bytes);

	const source = sources[hash] ?? {
		title: 'Extrait du canal WhatsApp',
		links: []
	};
	const passage = passageLink(post.text);
	const text = post.text.trim();
	return {
		id: post.id,
		publishedAt: publishedAt(post.pre ?? ''),
		text,
		excerpt: text
			.replace(/^🎧\s*/, '')
			.replace(/\s+/g, ' ')
			.slice(0, 220)
			.trim(),
		bodyHtml: sanitizeWhatsAppHtml(post.html),
		image: `/img/extraits/${imageName}`,
		imageWidth: Number(post.mediaWidth) || 1200,
		imageHeight: Number(post.mediaHeight) || 675,
		sourceTitle: source.title,
		links: passage ? [passage, ...source.links] : source.links
	};
}

function selfTest() {
	const clean = sanitizeWhatsAppHtml(
		'<span>Une &amp; deux<br><strong onclick="bad()">paroles</strong><img src=x onerror=x alt="🎧"><script>alert(1)</script></span>'
	);
	assert.equal(clean, 'Une &amp; deux<br><strong>paroles</strong>🎧alert(1)');
	assert(!clean.includes('onclick'));
	assert(!clean.includes('<script'));
	assert.equal(publishedAt('[16:34, 8/31/2026] Canal: '), '2026-08-31T14:34:00.000Z');
	console.log('WhatsApp channel importer checks passed.');
}

function main() {
	if (process.argv[2] === '--test') return selfTest();
	const input = process.argv.slice(2).find((argument) => argument !== '--');
	if (!input)
		throw new Error('Usage: node scripts/import-whatsapp-channel.mjs <channel-export.json>');

	const archive = JSON.parse(readFileSync(resolve(input), 'utf8'));
	if (!Array.isArray(archive.posts)) throw new Error(`${basename(input)} has no posts array`);
	mkdirSync(imageDirectory, { recursive: true });
	mkdirSync(dirname(outputFile), { recursive: true });

	const previous = existsSync(outputFile)
		? (JSON.parse(readFileSync(outputFile, 'utf8')).posts ?? [])
		: [];
	const posts = new Map(previous.map((post) => [post.id, post]));
	for (const post of archive.posts) posts.set(post.id, normalizePost(post));
	const sorted = [...posts.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

	writeFileSync(
		outputFile,
		`${JSON.stringify(
			{
				channel: archive.channel?.name || 'TRANSCRIPTION DES PRÉDICATIONS',
				channelUrl,
				generatedAt: new Date().toISOString(),
				posts: sorted
			},
			null,
			2
		)}\n`
	);

	const unlinked = sorted.filter((post) => post.links.length === 0).length;
	console.log(
		`Imported ${archive.posts.length} posts; ${sorted.length} total; ${unlinked} without source links.`
	);
}

main();
