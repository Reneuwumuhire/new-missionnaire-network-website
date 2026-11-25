<script lang="ts">
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import PdfPreview, { pdfActionClass } from '$lib/components/PdfPreview.svelte';
	import { t, locale } from '../../../i18n';
	import { formatFileSize } from '../../../utils/FormatTime';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let previewLoadedFor = $state('');
</script>

<div class="px-3 pb-24 sm:px-6">
	<Breadcrumbs
		items={[{ label: $t('nav.transcriptions'), href: '/transcriptions' }, { label: data.title }]}
	/>

	<article
		class="mx-auto w-full max-w-4xl border border-stone-200/60 bg-white/40 p-4 sm:p-6 md:p-8"
	>
		<h1 class="break-words font-display text-3xl font-semibold leading-tight text-stone-900">
			{data.title}
		</h1>

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
