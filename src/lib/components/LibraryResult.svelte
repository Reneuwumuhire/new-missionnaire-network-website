<script lang="ts">
	import type { LibraryResult } from '$lib/utils/librarySearch';
	import { t } from '../../i18n';
	import { formatTime } from '../../utils/FormatTime';
	let { result, onplay }: { result: LibraryResult; onplay?: (result: LibraryResult) => void } =
		$props();
</script>

<article class="py-5 border-b border-stone-200/70">
	<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 mb-2">
		<span class="font-semibold text-stone-700">{$t(`search.${result.type}`)}</span>
		{#if result.author}<span>{result.author}</span>{/if}
		{#if result.date}<time datetime={result.date}>{result.date}</time>{/if}
		{#if result.category}<span>{result.category}</span>{/if}
		{#each result.languages.filter((l) => l !== 'unknown') as language}<span
				>{language.toUpperCase()}</span
			>{/each}
	</div>
	<h2 class="text-lg sm:text-xl font-medium leading-snug break-words">
		{#if result.href}<a
				class="hover:text-missionnaire focus-visible:outline focus-visible:outline-2 focus-visible:outline-missionnaire"
				href={result.href}>{result.title}</a
			>
		{:else}{result.title}{/if}
	</h2>
	<p class="mt-2 text-sm leading-relaxed text-stone-600 max-w-[75ch] break-words">
		{result.snippet.before}<mark class="bg-missionnaire-100 text-stone-900"
			>{result.snippet.match}</mark
		>{result.snippet.after}
	</p>
	<div class="mt-2 flex flex-wrap gap-4 items-center">
		{#if result.href.startsWith('/lecture/')}<a
				class="min-h-11 inline-flex items-center text-sm font-semibold underline underline-offset-4"
				href={result.href}>{$t('search.openPassage')}</a
			>{/if}
		{#if onplay && result.audioUrl}
			<button
				type="button"
				class="min-h-11 text-sm font-semibold text-missionnaire-Yellow-700 hover:underline focus-visible:outline focus-visible:outline-2"
				onclick={() => onplay?.(result)}
				aria-label={`${result.startSec !== null ? $t('search.listenAt', { time: formatTime(result.startSec) }) : $t('search.listen')} — ${result.title}`}
			>
				{result.startSec !== null
					? $t('search.listenAt', { time: formatTime(result.startSec) })
					: $t('search.listen')}
			</button>
		{/if}
		{#if result.page && result.pageHref}<a
				class="min-h-11 inline-flex items-center text-sm text-stone-600 hover:underline"
				href={result.pageHref}>{$t('search.pdfPage', { page: result.page })}</a
			>{/if}
	</div>
</article>
