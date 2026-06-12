<script lang="ts">
	import { t } from '../../i18n';

	/** "Affichage de X–Y sur Z" line for paginated lists, plus a
	 *  results-for-query line when a search is active. aria-live so screen
	 *  readers announce result changes after filtering. */
	interface Props {
		from: number;
		to: number;
		total: number;
		query?: string;
	}

	let { from, to, total, query = '' }: Props = $props();

	let trimmedQuery = $derived(query.trim());
</script>

<div aria-live="polite" class="text-[12px] text-stone-500 font-body">
	<p>{$t('list.showing', { from, to, total })}</p>
	{#if trimmedQuery}
		<p class="mt-0.5">
			{#if total === 0}
				{$t('list.noResultsFor', { query: trimmedQuery })}
			{:else if total === 1}
				{$t('list.oneResultFor', { query: trimmedQuery })}
			{:else}
				{$t('list.resultsFor', { count: total, query: trimmedQuery })}
			{/if}
		</p>
	{/if}
</div>
