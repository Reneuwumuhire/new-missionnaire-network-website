<script lang="ts">
	import type { PageData } from './$types';
	import type { Sermon } from '$lib/models/sermon';
	import type { LiveStreamTrack } from '$lib/utils/liveTrack';
	import { basePlaylist, currentIndex, isPlaying, playlist, selectAudio } from '$lib/stores/global';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import { onMount } from 'svelte';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import {
		availableSermonVersions,
		getSermonVersion,
		parseSermonLanguage,
		type SermonLanguage
	} from '$lib/utils/sermonLanguage';
	import { createPlayableSermon } from '../../../utils/audioPlayback';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function getCurrentAudioUrl(
		current: Sermon | LiveStreamTrack | Record<string, unknown> | null
	): string | null {
		if (!current) return null;
		if ('mp3_url' in current && typeof current.mp3_url === 'string') return current.mp3_url;
		if ('s3_url' in current && typeof current.s3_url === 'string') return current.s3_url;
		if ('url' in current && typeof current.url === 'string') return current.url;
		return null;
	}

	function toggleSermonAudio(language: SermonLanguage) {
		const targetUrl = getSermonVersion(sermon, language).audioUrl;
		if (!targetUrl) return;

		if (currentSelectedUrl === targetUrl) {
			dispatchAudioPlayerAction('toggle');
			return;
		}

		const selectedSermon = createPlayableSermon(sermon, language);

		basePlaylist.set([selectedSermon]);
		playlist.set([selectedSermon]);
		currentIndex.set(0);
		selectAudio.set(selectedSermon);
		isPlaying.set(true);
	}

	function initAudioOnPageOpen() {
		const version = selectedVersion.audioUrl
			? selectedVersion
			: versions.find((candidate) => candidate.audioUrl);
		if (!version) return;
		const targetUrl = version.audioUrl;
		if (!targetUrl || currentSelectedUrl === targetUrl) return;

		const selectedSermon = createPlayableSermon(sermon, version.language);
		basePlaylist.set([selectedSermon]);
		playlist.set([selectedSermon]);
		currentIndex.set(0);
		selectAudio.set(selectedSermon);
		isPlaying.set(false);
	}

	onMount(() => {
		initAudioOnPageOpen();
	});
	let sermon = $derived(data.sermon as unknown as Sermon);
	let selectedLanguage = $derived(parseSermonLanguage(data.language));
	let selectedVersion = $derived(getSermonVersion(sermon, selectedLanguage));
	let versions = $derived(availableSermonVersions(sermon));
	let relatedSermons = $derived((data.relatedSermons || []) as any[]);
	let sermonTitle = $derived(selectedVersion.title);
	let sermonDate = $derived(sermon.full_date_code || sermon.date_code || sermon.iso_date || '');
	let description = $derived(
		`Écoutez la prédication "${sermonTitle}"${
			sermonDate ? ` (${sermonDate})` : ''
		} sur Missionnaire Network.`
	);
	let canonicalUrl = $derived(`https://missionnaire.net/predications/${data.canonicalSlug}`);
	let jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'AudioObject',
			name: sermonTitle,
			description,
			url: canonicalUrl,
			contentUrl: selectedVersion.audioUrl || undefined,
			encodingFormat: 'audio/mpeg',
			duration: selectedVersion.duration
				? `PT${Math.floor(selectedVersion.duration / 60)}M${selectedVersion.duration % 60}S`
				: undefined,
			datePublished: sermon.iso_date || sermon.full_date_code || undefined,
			author: sermon.author ? { '@type': 'Person', name: sermon.author } : undefined,
			publisher: {
				'@type': 'Organization',
				name: 'Missionnaire Network',
				url: 'https://missionnaire.net'
			},
			inLanguage: selectedVersion.code
		})
	);
	let previewVersion = $derived(
		selectedVersion.pdfUrl ? selectedVersion : versions.find((version) => version.pdfUrl)
	);
	let previewPdfUrl = $derived(
		previewVersion?.pdfUrl
			? `/predications/${data.canonicalSlug}/pdf?lang=${previewVersion.language}`
			: ''
	);
	let currentSelectedUrl = $derived(getCurrentAudioUrl($selectAudio));
</script>

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->
<svelte:head>
	{@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<Breadcrumbs items={[{ label: 'Prédications', href: '/predications' }, { label: sermonTitle }]} />

<article class="w-full max-w-4xl mx-auto bg-white/40 border border-stone-200/60 p-6 md:p-8">
	<div class="max-w-4xl">
		<h1 class="font-display text-3xl font-semibold text-stone-900 leading-tight">{sermonTitle}</h1>
		<div class="mt-3 flex flex-wrap gap-3 text-[12px] text-stone-400 font-body">
			{#if sermon.author}
				<span class="font-semibold text-stone-700">{sermon.author}</span>
			{/if}
			{#if sermonDate}
				<span>{sermonDate}</span>
			{/if}
		</div>

		<div class="mt-6 flex flex-wrap gap-3">
			{#each versions as version}
				{#if version.audioUrl}
					<button
						type="button"
						class="px-4 py-2 bg-stone-900 text-white text-xs font-semibold uppercase tracking-wider hover:bg-stone-800 transition-colors"
						onclick={() => toggleSermonAudio(version.language)}
					>
						{currentSelectedUrl === version.audioUrl && $isPlaying ? 'Pause' : 'Lire'} audio {version.code.toUpperCase()}
					</button>
				{/if}
			{/each}
			{#if previewPdfUrl}
				<a
					href="#pdf-preview"
					class="px-4 py-2 border border-stone-200/60 bg-white/40 text-stone-700 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors"
				>
					Voir PDF sur la page
				</a>
			{/if}
			{#if previewPdfUrl}
				<a
					href={previewPdfUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="px-4 py-2 border border-stone-200/60 bg-white/40 text-stone-700 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors"
				>
					Ouvrir PDF
				</a>
			{/if}
			{#each versions as version}
				{#if version.pdfUrl && version.language !== previewVersion?.language}
					<a
						href={`/predications/${data.canonicalSlug}/pdf?lang=${version.language}`}
						target="_blank"
						rel="noopener noreferrer"
						class="px-4 py-2 border border-stone-200/60 bg-white/40 text-stone-700 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors"
					>
						PDF {version.code.toUpperCase()}
					</a>
				{/if}
			{/each}
		</div>

		{#if versions.some((version) => version.audioUrl)}
			<p class="mt-5 text-xs text-stone-500">
				Lancez l'audio puis consultez le document ci-dessous sans quitter cette page.
			</p>
		{/if}
	</div>

	{#if previewPdfUrl}
		<section id="pdf-preview" class="mt-10 scroll-mt-28">
			<div class="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
				<h2 class="text-sm font-semibold uppercase tracking-[0.25em] text-missionnaire">
					Aperçu PDF
				</h2>
				<a
					href={previewPdfUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-[11px] font-semibold uppercase tracking-wider text-stone-500 hover:text-missionnaire transition-colors"
				>
					Ouvrir dans un nouvel onglet
				</a>
			</div>

			<div class="border border-stone-200/60 overflow-hidden bg-white/40">
				<object
					data={previewPdfUrl}
					type="application/pdf"
					title={`PDF ${sermonTitle}`}
					class="w-full min-h-[360px] h-[62vh] md:h-[75vh] lg:h-[860px]"
				>
					<div
						class="min-h-[360px] flex items-center justify-center text-sm text-stone-600 p-6 text-center"
					>
						Cet appareil ne peut pas afficher l'aperçu PDF. Utilisez le lien ci-dessus pour ouvrir
						le document dans un nouvel onglet.
					</div>
				</object>
			</div>
		</section>
	{/if}
</article>

{#if relatedSermons.length > 0}
	<section class="w-full max-w-4xl mx-auto mt-8">
		<h2 class="text-sm font-semibold uppercase tracking-[0.25em] text-stone-400 mb-4">
			Du meme auteur
		</h2>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
			{#each relatedSermons as related}
				<a
					href="/predications/{related.slug}"
					class="bg-white/40 border border-stone-200/60 p-4 hover:border-missionnaire transition-all group card-lift"
				>
					<div
						class="text-sm font-bold text-stone-800 group-hover:text-missionnaire transition-colors line-clamp-2"
					>
						{related.french_title || related.english_title || 'Sans titre'}
					</div>
					<div class="flex items-center gap-2 mt-2 text-[12px] text-stone-400 font-body">
						{#if related.full_date_code || related.date_code}
							<span>{related.full_date_code || related.date_code}</span>
						{/if}
						{#if related.mp3_url}
							<span class="text-missionnaire/60">Audio</span>
						{/if}
						{#if related.pdf_url}
							<span class="text-red-400">PDF</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	</section>
{/if}
