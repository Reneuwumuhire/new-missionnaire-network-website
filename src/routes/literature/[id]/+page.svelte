<script lang="ts">
	import { t } from '../../../i18n';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import { pdfActionClass } from '$lib/components/PdfPreview.svelte';
	let { data } = $props();
</script>

<div class="mx-auto w-full max-w-4xl px-5 py-8 sm:px-6">
	<Breadcrumbs
		items={[{ label: $t('nav.literature'), href: '/literature' }, { label: data.title }]}
	/>
	<article class="border border-stone-200 bg-white/60 p-5 sm:p-8">
		<h1 class="font-display text-3xl font-semibold text-stone-900 sm:text-4xl">{data.title}</h1>
		<p class="mt-2 text-sm text-stone-600">
			{data.author} · {$t(data.language === 'english' ? 'lang.english' : 'lang.french')}
		</p>
		{#if data.description}<p class="mt-4 max-w-prose whitespace-pre-line leading-relaxed">
				{data.description}
			</p>{/if}
		{#if data.pdfUrl}
			<a
				href={data.pdfUrl}
				class={`mt-5 ${pdfActionClass}`}
				target="_blank"
				rel="noopener noreferrer"
			>
				{$t(data.parts.length ? 'literature.downloadBook' : 'predications.openPdf')}
			</a>
		{/if}
		{#if data.parts.length}
			<ol class="mt-5 list-decimal space-y-2 border-t border-stone-200 pl-6 pt-5">
				{#each data.parts as part}
					<li>
						<a
							href={part.url}
							target="_blank"
							rel="noopener noreferrer"
							class="underline underline-offset-4 hover:text-missionnaire-Yellow-700"
							>{part.title}</a
						>
					</li>
				{/each}
			</ol>
		{/if}
	</article>
</div>
