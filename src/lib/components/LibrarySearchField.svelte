<script lang="ts">
	import { MAX_PASSAGE_QUERY } from '$lib/utils/passageSearch';
	import { t } from '../../i18n';

	let { value = '', pending = false }: { value?: string; pending?: boolean } = $props();
</script>

<div
	class="flex border border-stone-300 bg-cream text-left font-body transition-colors focus-within:border-missionnaire-Yellow-600 focus-within:ring-2 focus-within:ring-missionnaire/20 motion-reduce:transition-none"
>
	<div class="flex min-w-0 flex-1 items-center gap-2.5 pl-3 sm:gap-3 sm:pl-4">
		<svg
			class="h-[18px] w-[18px] shrink-0 text-missionnaire-Yellow-700"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="7" />
			<path d="m21 21-4.3-4.3" />
		</svg>
		<input
			name="q"
			required
			minlength="2"
			maxlength={MAX_PASSAGE_QUERY}
			{value}
			type="search"
			aria-label={$t('search.library')}
			placeholder={$t('search.queryPlaceholder')}
			readonly={pending}
			class="min-h-12 min-w-0 flex-1 appearance-none bg-transparent pr-3 text-sm text-stone-900 placeholder:text-stone-500"
		/>
	</div>
	<button
		type="submit"
		disabled={pending}
		class="grid min-h-12 w-[7.25rem] shrink-0 place-items-center border-l border-stone-300 bg-cream-dark/60 px-2 py-2 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] text-stone-700 transition-colors hover:bg-missionnaire-50 hover:text-earth-dark focus-visible:outline-offset-[-3px] disabled:cursor-wait disabled:bg-cream-dark motion-reduce:transition-none sm:w-44 sm:px-3 sm:text-[11px] sm:tracking-[0.16em]"
	>
		<span class="col-start-1 row-start-1" class:invisible={pending}>
			{$t('search.action')}
		</span>
		{#if pending}
			<span class="col-start-1 row-start-1 inline-flex items-center gap-1.5 sm:gap-2">
				<span
					class="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-missionnaire/25 border-t-missionnaire-Yellow-700 motion-safe:animate-spin"
					aria-hidden="true"
				></span>
				{$t('search.loading')}
			</span>
		{/if}
	</button>
</div>
