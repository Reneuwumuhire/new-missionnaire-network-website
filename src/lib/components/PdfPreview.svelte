<script lang="ts">
	import { t } from '../../i18n';

	let { url, title }: { url: string; title: string } = $props();
</script>

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
