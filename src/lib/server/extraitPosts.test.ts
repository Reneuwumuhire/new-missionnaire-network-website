import { describe, expect, it } from 'vitest';
import {
	addMissingPdfLink,
	addMissingRecordingLinks,
	applySourceResources,
	recordingSourceFromLinks,
	whatsappTextFromHtml
} from './extraitPosts';

describe('whatsappTextFromHtml', () => {
	it('restores WhatsApp formatting and leading media icons', () => {
		expect(
			whatsappTextFromHtml(
				'🎦 «Un <strong>avertissement</strong><br><br><em>Une citation</em> &amp; <code>un passage</code>»'
			)
		).toBe('🎦 «Un *avertissement*\n\n_Une citation_ & `un passage`»');
	});
});

describe('addMissingPdfLink', () => {
	it('adds a PDF that became available after publication', () => {
		expect(addMissingPdfLink([], 'https://cdn.example.com/message.pdf')).toEqual([
			{ label: 'Lire le PDF', href: 'https://cdn.example.com/message.pdf', kind: 'pdf' }
		]);
	});

	it('keeps an existing manual PDF link', () => {
		const links = [{ label: 'PDF corrigé', href: '/pdf/manual', kind: 'pdf' }];
		expect(addMissingPdfLink(links, 'https://cdn.example.com/new.pdf')).toBe(links);
	});
});

it('recovers a legacy post source and adds its current recording links', () => {
	const links = [
		{
			label: 'Écouter la retransmission',
			href: '/live/rediffusions/6abd477a1473609269a4fcb7',
			kind: 'live'
		}
	];
	expect(recordingSourceFromLinks(links)).toEqual({
		kind: 'recording',
		id: '6abd477a1473609269a4fcb7'
	});
	expect(
		addMissingRecordingLinks(links, 'zVSriQEuJmM', 'https://cdn.example.com/transcription.pdf')
	).toEqual([
		{
			label: 'Écouter et lire la transcription',
			href: '/live/rediffusions/6abd477a1473609269a4fcb7',
			kind: 'live'
		},
		{ label: 'Voir la vidéo', href: '/videos?v=zVSriQEuJmM', kind: 'video' },
		{
			label: 'Lire le PDF',
			href: 'https://cdn.example.com/transcription.pdf',
			kind: 'pdf'
		}
	]);
});

it('uses a linked recording thumbnail for publication posts', () => {
	const post = {
		id: 'post-1',
		publishedAt: '2026-10-01T20:20:00.000Z',
		text: 'Post body',
		excerpt: 'Post body',
		bodyHtml: 'Post body',
		image: '/img/extraits/fallback.jpg',
		imageWidth: 1080,
		imageHeight: 608,
		sourceTitle: 'Linked recording',
		links: [
			{
				label: 'Écouter la retransmission',
				href: '/live/rediffusions/6abd477a1473609269a4fcb7',
				kind: 'live'
			}
		],
		source: { kind: 'recording' as const, id: '6abd477a1473609269a4fcb7' }
	};

	expect(
		applySourceResources(post, {
			thumbnail:
				'https://missionnaire-bucket.s3.af-south-1.amazonaws.com/broadcast-thumbnails/live.jpg',
			videoId: 'zVSriQEuJmM',
			pdf: 'https://cdn.example.com/transcription.pdf'
		})
	).toMatchObject({
		image: 'https://missionnaire-bucket.s3.af-south-1.amazonaws.com/broadcast-thumbnails/live.jpg',
		links: [
			{
				label: 'Écouter et lire la transcription',
				href: '/live/rediffusions/6abd477a1473609269a4fcb7',
				kind: 'live'
			},
			{ label: 'Voir la vidéo', href: '/videos?v=zVSriQEuJmM', kind: 'video' },
			{ label: 'Lire le PDF', href: 'https://cdn.example.com/transcription.pdf', kind: 'pdf' }
		]
	});
});
