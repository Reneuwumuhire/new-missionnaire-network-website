<script lang="ts">
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import PdfPreview, { pdfActionClass } from '$lib/components/PdfPreview.svelte';
	import { t, locale } from '../../../i18n';
	import { formatFileSize } from '../../../utils/FormatTime';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let previewLoadedFor = $state('');
</script>

<header class="border-b border-stone-800 bg-stone-900 text-white">
	<div class="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 md:py-8">
		<a
			href="/transcriptions"
			class="font-display text-[26px] font-semibold leading-none transition-colors hover:text-missionnaire md:text-4xl"
		>
			{$t('nav.transcriptions')}
		</a>
	</div>
</header>

<div class="mx-auto w-full max-w-7xl px-3 pt-4 pb-24 sm:px-6 md:pt-8">
	<Breadcrumbs
		items={[{ label: $t('nav.transcriptions'), href: '/transcriptions' }, { label: data.title }]}
	/>

	<article
		class="mx-auto w-full max-w-4xl border border-stone-200/60 bg-white/40 p-4 sm:p-6 md:p-8"
	>
		<h1
			class="text-pretty break-words font-display text-2xl font-semibold leading-tight text-stone-900 sm:text-3xl"
		>
			{data.title}
		</h1>
		{#if data.recordingDetails}
			<p class="mt-2 max-w-prose text-sm leading-relaxed text-stone-600">{data.recordingDetails}</p>
		{/if}

		<dl class="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-xs text-stone-700">
			<div>
				<dt class="font-semibold uppercase tracking-wider text-stone-500">
					{$t('transcriptions.fileSize')}
				</dt>
				<dd class="mt-1">{formatFileSize(data.size)}</dd>
			</div>
			<div>
				<dt class="font-semibold uppercase tracking-wider text-stone-500">
					{$t('transcriptions.publishDate')}
				</dt>
				<dd class="mt-1">
					{new Date(data.publishedOn).toLocaleDateString($locale, { timeZone: 'UTC' })}
				</dd>
			</div>
		</dl>

		<div class="mt-6 flex flex-wrap gap-3">
			<a href="#pdf-preview" class={pdfActionClass} onclick={() => (previewLoadedFor = data.id)}>
				{$t('predications.viewPdfOnPage')}
			</a>
			<a href={data.pdfUrl} target="_blank" rel="noopener noreferrer" class={pdfActionClass}>
				{$t('predications.openPdf')}
			</a>
			<a href={data.pdfUrl} download class={pdfActionClass}>
				{$t('transcriptions.downloadDocument')}
			</a>
			{#if data.videoUrl}
				<a href={data.videoUrl} target="_blank" rel="noopener noreferrer" class={pdfActionClass}>
					{$t('transcriptions.watchRelated')}
				</a>
			{/if}
		</div>

		<PdfPreview
			id="pdf-preview"
			url={data.pdfUrl}
			title={data.title}
			loaded={previewLoadedFor === data.id}
			onloadpreview={() => (previewLoadedFor = data.id)}
		/>
	</article>
</div>
