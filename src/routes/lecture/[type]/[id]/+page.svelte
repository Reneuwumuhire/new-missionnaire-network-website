<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '../../../../i18n';
	import { libraryHref } from '$lib/utils/librarySearch';
	import { playLibraryResult } from '$lib/utils/playLibraryResult';
	import { formatTime } from '../../../../utils/FormatTime';
	import PassagePdf from '$lib/components/PassagePdf.svelte';
	let { data } = $props();
	let passage: HTMLElement;
	let playbackMessage = $state('');
	let expandedText = $state(false);
	$effect(() => {
		data.query;
		data.occurrence;
		data.result.id;
		expandedText = false;
	});
	const occurrenceHref = (occurrence: number) => {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('occurrence', String(occurrence));
		return `${$page.url.pathname}?${params}`;
	};
	let pdfUrl = $derived(
		`/api/library/${data.result.type}/${data.result.id}/pdf?${$page.url.searchParams}`
	);
	afterNavigate(() => {
		if (data.pages.length) return;
		const mark = passage?.querySelector('mark');
		mark?.scrollIntoView({ block: 'center', behavior: 'instant' });
	});
</script>

<section class="bg-cream text-stone-800 font-body px-5 sm:px-8 py-8 sm:py-12 pb-32">
	<div class="max-w-4xl mx-auto">
		<a
			class="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
			href={libraryHref({
				q: data.query,
				match: data.mode,
				language: $page.url.searchParams.get('language') || ''
			})}>{$t('reader.back')}</a
		>
		<p class="text-xs uppercase tracking-widest text-stone-500 mt-5">
			{$t(`search.${data.result.type}`)}{#if data.result.author}
				· {data.result.author}{/if}
		</p>
		<h1 class="font-display text-3xl sm:text-5xl leading-tight mt-2 break-words">
			{data.result.title}
		</h1>
		<p class="text-stone-600 mt-4 break-words">
			{$t(data.mode === 'words' ? 'search.similarPassages' : 'search.exactPhrase')} : {data.query}
		</p>
		<nav
			aria-label={$t('reader.matches')}
			class="sticky top-[var(--header-height,100px)] z-10 bg-cream flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-stone-200 my-6 py-2 text-sm"
		>
			<p role="status">{$t('reader.position', { current: data.occurrence, total: data.count })}</p>
			{#if data.occurrence > 1}<a
					class="min-h-11 inline-flex items-center underline"
					href={occurrenceHref(data.occurrence - 1)}>{$t('reader.previous')}</a
				>{/if}
			{#if data.occurrence < data.count}<a
					class="min-h-11 inline-flex items-center underline"
					href={occurrenceHref(data.occurrence + 1)}>{$t('reader.next')}</a
				>{/if}
		</nav>
		{#snippet excerpt()}
			<article
				bind:this={passage}
				aria-label={$t('search.openPassage')}
				class="border-l-2 border-stone-200 pl-5 sm:pl-7 text-lg leading-relaxed whitespace-pre-wrap break-words"
			>
				{#if data.before}…
				{/if}{#each data.segments as segment}{#if segment.marked}<mark
							class="bg-missionnaire-100 text-stone-950 rounded-sm">{segment.text}</mark
						>{:else}{segment.text}{/if}{/each}{#if data.after}
					…{/if}
			</article>
		{/snippet}
		{#if data.pages.length}
			<details bind:open={expandedText} class="text-stone-600">
				<summary class="min-h-11 cursor-pointer text-sm underline underline-offset-4"
					>{$t('reader.extracted')}</summary
				>
				{@render excerpt()}
			</details>
		{:else}{@render excerpt()}{/if}
		<div class="flex flex-wrap items-center gap-5 my-4">
			{#if data.result.audioUrl}<button
					class="min-h-12 rounded-lg px-5 bg-missionnaire text-stone-950 font-semibold"
					onclick={() => {
						playLibraryResult(data.result);
						playbackMessage = $t('search.selected', { title: data.result.title });
					}}
					>{data.result.startSec !== null
						? $t('search.listenAt', { time: formatTime(data.result.startSec) })
						: $t('search.listen')}</button
				>{/if}
			{#if data.result.pageHref || data.result.sourceHref}<a
					class="inline-flex items-center min-h-11 underline underline-offset-4"
					href={data.result.pageHref || data.result.sourceHref}>{$t('reader.original')}</a
				>{/if}
		</div>
		<p class="sr-only" role="status">{playbackMessage}</p>
		{#key `${pdfUrl}:${data.occurrence}`}{#each data.pages as item, index}<PassagePdf
					url={pdfUrl}
					{...item}
					reveal={index === 0}
					onunavailable={() => {
						expandedText = true;
					}}
				/>{/each}{/key}
	</div>
</section>
