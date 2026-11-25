<script module lang="ts">
	export const pdfActionClass =
		'px-4 py-2 border border-stone-200/60 bg-white/40 text-stone-700 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors';
</script>

<script lang="ts">
	import { t } from '../../i18n';

	let {
		id,
		url,
		title,
		loaded,
		onloadpreview
	}: {
		id: string;
		url: string;
		title: string;
		loaded: boolean;
		onloadpreview: () => void;
	} = $props();
</script>

<section {id} class="mt-10 scroll-mt-28">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-sm font-semibold uppercase tracking-[0.25em] text-missionnaire">
			{$t('predications.pdfPreview')}
		</h2>
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			class="text-[11px] font-semibold uppercase tracking-wider text-stone-500 transition-colors hover:text-missionnaire"
		>
			{$t('predications.openNewTab')}
		</a>
	</div>

	<div class="overflow-hidden border border-stone-200/60 bg-white/40">
		{#if loaded}
			<object
				data={url}
				type="application/pdf"
				{title}
				class="block w-full min-h-[360px] h-[62vh] md:h-[75vh] lg:h-[860px]"
			>
				<div
					class="flex min-h-[360px] flex-col items-center justify-center gap-4 p-6 text-center text-sm text-stone-600"
				>
					<p>{$t('predications.pdfFallback')}</p>
					<a href={url} target="_blank" rel="noopener noreferrer" class="underline">
						{$t('predications.openNewTab')}
					</a>
				</div>
			</object>
		{:else}
			<button
				type="button"
				onclick={onloadpreview}
				class="min-h-[360px] w-full text-sm font-semibold text-missionnaire hover:underline"
			>
				{$t('predications.viewPdfOnPage')}
			</button>
		{/if}
	</div>
</section>
