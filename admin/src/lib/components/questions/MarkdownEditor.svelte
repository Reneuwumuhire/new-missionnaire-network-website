<script lang="ts">
	import RichTextToolbar from './RichTextToolbar.svelte';
	import FormattedQuestionText from './FormattedQuestionText.svelte';
	import { t } from '$lib/i18n';

	let {
		id,
		name,
		content = '',
		rows = 10,
		placeholder = ''
	}: {
		id: string;
		name: string;
		content?: string;
		rows?: number;
		placeholder?: string;
	} = $props();

	let value = $state(content);
	let tab = $state<'write' | 'preview'>('write');

	const hasContent = $derived(value.trim().length > 0);
</script>

<div
	class="overflow-hidden border border-stone-300 bg-white transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30"
>
	<div
		class="flex flex-wrap items-center justify-between gap-1 border-b border-stone-200 bg-stone-50 px-2 pt-2"
	>
		<div class="flex items-end gap-1" role="tablist" aria-label={$t('questions.editor.label')}>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'write'}
				onclick={() => (tab = 'write')}
				class={`-mb-px border px-3.5 py-1.5 text-sm font-semibold transition ${
					tab === 'write'
						? 'rounded-t-md border-stone-200 border-b-white bg-white text-stone-900'
						: 'border-transparent text-stone-500 hover:text-stone-800'
				}`}
			>
				{$t('questions.editor.write')}
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'preview'}
				onclick={() => (tab = 'preview')}
				class={`-mb-px border px-3.5 py-1.5 text-sm font-semibold transition ${
					tab === 'preview'
						? 'rounded-t-md border-stone-200 border-b-white bg-white text-stone-900'
						: 'border-transparent text-stone-500 hover:text-stone-800'
				}`}
			>
				{$t('questions.editor.preview')}
			</button>
		</div>

		<div class="pb-1.5" class:hidden={tab !== 'write'}>
			<RichTextToolbar targetId={id} bare />
		</div>
	</div>

	<div class="bg-white p-2">
		<textarea
			{id}
			{name}
			{rows}
			{placeholder}
			bind:value
			class:hidden={tab !== 'write'}
			class="block w-full resize-y border-0 bg-transparent px-2 py-2 text-sm leading-7 text-stone-800 outline-none placeholder:text-stone-400"
		></textarea>

		{#if tab === 'preview'}
			<div class="min-h-[8rem] px-2 py-2">
				{#if hasContent}
					<FormattedQuestionText text={value} proseClass="text-sm leading-7 text-stone-800" />
				{:else}
					<p class="text-sm italic text-stone-400">{$t('questions.editor.nothingToPreview')}</p>
				{/if}
			</div>
		{/if}
	</div>

	<div class="border-t border-stone-100 bg-stone-50/60 px-3 py-1.5 text-[11px] text-stone-400">
		{$t('questions.editor.markdownHint')}
	</div>
</div>
