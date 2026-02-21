<script lang="ts">
	import type { PageData } from './$types';
	import type { Sermon } from '$lib/models/sermon';
	import { basePlaylist, currentIndex, isPlaying, playlist, selectAudio } from '$lib/stores/global';
	import { onMount } from 'svelte';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsChevronLeft from 'svelte-icons-pack/bs/BsChevronLeft';

	export let data: PageData;

	$: sermon = data.sermon as unknown as Sermon;
	$: sermonTitle = sermon.french_title || sermon.english_title || 'Prédication';
	$: sermonDate = sermon.full_date_code || sermon.date_code || sermon.iso_date || '';
	$: description = `Écoutez la prédication "${sermonTitle}"${
		sermonDate ? ` (${sermonDate})` : ''
	} sur Missionnaire Network.`;
	$: canonicalUrl = `https://missionnaire.net/predications/${data.canonicalSlug}`;
	$: frenchPdfProxyUrl = sermon.pdf_url ? `/predications/${data.canonicalSlug}/pdf?lang=fr` : '';
	$: englishPdfProxyUrl = sermon.english_pdf_url
		? `/predications/${data.canonicalSlug}/pdf?lang=en`
		: '';
	$: previewPdfUrl = frenchPdfProxyUrl || englishPdfProxyUrl;
	$: currentSelectedUrl = getCurrentAudioUrl($selectAudio);
	$: isFrenchTrackActive = !!sermon.mp3_url && currentSelectedUrl === sermon.mp3_url;
	$: isEnglishTrackActive =
		!!sermon.english_audio_url && currentSelectedUrl === sermon.english_audio_url;

	function getCurrentAudioUrl(current: Sermon | Record<string, unknown> | null): string | null {
		if (!current) return null;
		if ('mp3_url' in current && typeof current.mp3_url === 'string') return current.mp3_url;
		if ('s3_url' in current && typeof current.s3_url === 'string') return current.s3_url;
		if ('url' in current && typeof current.url === 'string') return current.url;
		return null;
	}

	function toggleSermonAudio(mode: 'french' | 'english') {
		const targetUrl = mode === 'english' ? sermon.english_audio_url : sermon.mp3_url;
		if (!targetUrl) return;

		if (currentSelectedUrl === targetUrl) {
			isPlaying.update((v) => !v);
			return;
		}

		const selectedSermon = buildSelectedSermon(mode);

		basePlaylist.set([selectedSermon]);
		playlist.set([selectedSermon]);
		currentIndex.set(0);
		selectAudio.set(selectedSermon);
		isPlaying.set(true);
	}

	function buildSelectedSermon(mode: 'french' | 'english'): Sermon {
		if (mode === 'english') {
			return {
				...sermon,
				mp3_url: sermon.english_audio_url,
				french_title: sermon.english_title || sermon.french_title
			} as Sermon;
		}

		return sermon;
	}

	function initAudioOnPageOpen() {
		const mode: 'french' | 'english' | null = sermon.mp3_url
			? 'french'
			: sermon.english_audio_url
			? 'english'
			: null;

		if (!mode) return;

		const targetUrl = mode === 'english' ? sermon.english_audio_url : sermon.mp3_url;
		if (!targetUrl || currentSelectedUrl === targetUrl) return;

		const selectedSermon = buildSelectedSermon(mode);
		basePlaylist.set([selectedSermon]);
		playlist.set([selectedSermon]);
		currentIndex.set(0);
		selectAudio.set(selectedSermon);
		isPlaying.set(false);
	}

	onMount(() => {
		initAudioOnPageOpen();
	});
</script>

<svelte:head>
	<title>{sermonTitle} | Prédications - Missionnaire Network</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:title" content={`${sermonTitle} | Prédications - Missionnaire Network`} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:title" content={`${sermonTitle} | Prédications - Missionnaire Network`} />
	<meta name="twitter:description" content={description} />
</svelte:head>

<div class="w-full max-w-7xl mx-auto mb-4">
	<a
		href="/predications"
		class="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors shadow-sm"
	>
		<Icon src={BsChevronLeft} size="14" />
		<span>Retour aux prédications</span>
	</a>
</div>

<article class="w-full max-w-7xl mx-auto bg-white border border-gray-100 rounded-2xl p-4 md:p-8 shadow-sm">
	<div class="max-w-4xl">
		<h1 class="text-2xl md:text-4xl font-black text-gray-900 leading-tight">{sermonTitle}</h1>
		<div class="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
			{#if sermon.author}
				<span class="font-semibold text-gray-700">{sermon.author}</span>
			{/if}
			{#if sermonDate}
				<span>{sermonDate}</span>
			{/if}
		</div>

		<div class="mt-6 flex flex-wrap gap-3">
			{#if sermon.mp3_url}
				<button
					type="button"
					class="px-4 py-2 rounded-full bg-orange-500 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-600 transition-colors"
					on:click={() => toggleSermonAudio('french')}
				>
					{isFrenchTrackActive && $isPlaying ? 'Pause audio FR' : 'Lire audio FR'}
				</button>
			{/if}
			{#if previewPdfUrl}
				<a
					href="#pdf-preview"
					class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
				>
					Voir PDF sur la page
				</a>
			{/if}
			{#if previewPdfUrl}
				<a
					href={frenchPdfProxyUrl || previewPdfUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
				>
					Ouvrir PDF
				</a>
			{/if}
			{#if sermon.english_audio_url}
				<button
					type="button"
					class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
					on:click={() => toggleSermonAudio('english')}
				>
					{isEnglishTrackActive && $isPlaying ? 'Pause audio EN' : 'Lire audio EN'}
				</button>
			{/if}
			{#if sermon.english_pdf_url}
				<a
					href={englishPdfProxyUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
				>
					PDF English
				</a>
			{/if}
		</div>

		{#if sermon.mp3_url || sermon.english_audio_url}
			<p class="mt-5 text-xs text-gray-500">
				Lancez l'audio puis consultez le document ci-dessous sans quitter cette page.
			</p>
		{/if}
	</div>

	{#if previewPdfUrl}
		<section id="pdf-preview" class="mt-10 scroll-mt-28">
			<div class="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
				<h2 class="text-sm font-black uppercase tracking-[0.2em] text-orange-500">Aperçu PDF</h2>
				<a
					href={previewPdfUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-orange-500 transition-colors"
				>
					Ouvrir dans un nouvel onglet
				</a>
			</div>

			<div class="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
				<object
					data={previewPdfUrl}
					type="application/pdf"
					title={`PDF ${sermonTitle}`}
					class="w-full min-h-[360px] h-[62vh] md:h-[75vh] lg:h-[860px]"
				>
					<div class="min-h-[360px] flex items-center justify-center text-sm text-gray-600 p-6 text-center">
						Cet appareil ne peut pas afficher l'aperçu PDF. Utilisez le lien ci-dessus pour
						ouvrir le document dans un nouvel onglet.
					</div>
				</object>
			</div>
		</section>
	{/if}
</article>
