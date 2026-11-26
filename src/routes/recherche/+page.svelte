<script lang="ts">
	import { playLibraryResult } from '$lib/utils/playLibraryResult';
	import { page, navigating } from '$app/state';
	import { t } from '../../i18n';
	import {
		libraryTypes,
		libraryHref,
		type LibraryResult as Result
	} from '$lib/utils/librarySearch';
	import LibraryResult from '$lib/components/LibraryResult.svelte';
	import LibrarySearchField from '$lib/components/LibrarySearchField.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	let { data } = $props();
	let playbackMessage = $state('');
	let searchPending = $derived(navigating.to?.route.id === '/recherche');
	let clearFiltersHref = $derived(libraryHref({ q: data.filters.q }));
	function play(result: Result) {
		playLibraryResult(result);
		playbackMessage = $t('search.selected', { title: result.title });
	}
</script>

<section class="bg-cream font-body text-stone-800 px-5 sm:px-8 py-10 sm:py-14">
	<div class="mx-auto max-w-5xl">
		<h1 class="font-display text-4xl sm:text-5xl leading-tight">{$t('search.library')}</h1>
		<p class="mt-3 text-stone-600 max-w-2xl">{$t('search.libraryDescription')}</p>
		{#key page.url.search}
			<form
				action="/recherche"
				method="GET"
				class="mt-7 border border-stone-300 bg-white/40 p-4 sm:p-6"
				role="search"
				aria-label={$t('search.library')}
				aria-busy={searchPending}
			>
				<LibrarySearchField value={data.filters.q} pending={searchPending} />
				<fieldset class="mt-4 min-w-0">
					<legend class="sr-only">{$t('search.matchMode')}</legend>
					<div
						class="grid w-full grid-cols-2 divide-x divide-stone-300 border border-stone-300 bg-cream sm:w-fit"
					>
						{#each ['phrase', 'words'] as mode}
							<label class="relative">
								<input
									type="radio"
									name="match"
									value={mode}
									checked={(data.filters.match || 'phrase') === mode}
									class="peer sr-only"
								/>
								<span
									class="mode-option peer-checked:border-missionnaire-Yellow-700 peer-checked:bg-missionnaire-50 peer-checked:font-semibold peer-checked:text-stone-900 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-3px] peer-focus-visible:outline-missionnaire-Yellow-600"
									>{$t(mode === 'phrase' ? 'search.exactPhrase' : 'search.similarPassages')}</span
								>
							</label>
						{/each}
					</div>
				</fieldset>
				<fieldset class="mt-6 min-w-0 border-t border-stone-300">
					<legend class="pr-3 text-sm font-semibold text-stone-800"
						>{$t('predications.filters')}</legend
					>
					<div class="mt-3 grid gap-x-4 gap-y-3 min-[360px]:grid-cols-2 md:grid-cols-3">
						<label class="filter-label min-[360px]:col-span-2 sm:col-span-1"
							>{$t('search.contentType')}<select
								name="type"
								class="search-field"
								value={data.filters.type}
							>
								<option value="">{$t('search.allTypes')}</option>{#each libraryTypes as type}<option
										value={type}>{$t(`search.${type}`)}</option
									>{/each}
							</select></label
						>
						<label class="filter-label min-[360px]:col-span-2 sm:col-span-1"
							>{$t('search.language')}<select
								name="language"
								class="search-field"
								value={data.filters.language}
							>
								<option value="">{$t('search.allLanguages')}</option><option value="fr"
									>{$t('lang.french')}</option
								><option value="en">English</option><option value="rw">Kinyarwanda</option><option
									value="sw">Kiswahili</option
								><option value="unknown">{$t('search.unspecified')}</option>
							</select></label
						>
						<label class="filter-label"
							>{$t('search.author')}<input
								name="author"
								class="search-field"
								maxlength="100"
								value={data.filters.author}
							/></label
						>
						<label class="filter-label"
							>{$t('search.category')}<input
								name="category"
								class="search-field"
								maxlength="100"
								value={data.filters.category}
							/></label
						>
						<label class="filter-label"
							>{$t('search.from')}<input
								name="from"
								type="date"
								class="search-field"
								value={data.filters.from}
							/></label
						>
						<label class="filter-label"
							>{$t('search.to')}<input
								name="to"
								type="date"
								class="search-field"
								value={data.filters.to}
							/></label
						>
					</div>
				</fieldset>
				<div
					class="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-300 pt-4 sm:justify-end"
				>
					<a
						href={clearFiltersHref}
						data-sveltekit-reload={new URL(clearFiltersHref, page.url).href === page.url.href}
						class="form-action flex-1 border border-stone-300 bg-cream text-stone-700 hover:border-missionnaire-Yellow-600 sm:flex-none"
						>{$t('search.resetFilters')}</a
					>
					<button
						type="submit"
						disabled={searchPending}
						class="form-action flex-1 border border-stone-900 bg-stone-900 text-cream hover:bg-stone-700 disabled:cursor-wait disabled:opacity-70 sm:flex-none"
						>{$t('search.applyFilters')}</button
					>
				</div>
			</form>
		{/key}
		<p class="sr-only" role="status">{searchPending ? $t('search.loading') : ''}</p>
	</div>
</section>

<section class="px-5 sm:px-8 pb-14 font-body" aria-busy={searchPending}>
	<div class="max-w-5xl mx-auto">
		<p class="sr-only" role="status">{playbackMessage}</p>
		{#if data.failure}
			<div role="alert" class="py-8 text-red-800">
				<p>{data.failure === 'invalid' ? $t('search.invalidFilters') : $t('search.unavailable')}</p>
				{#if data.failure === 'unavailable'}<a
						class="underline min-h-11 inline-flex items-center"
						href={page.url.pathname + page.url.search}
						data-sveltekit-reload>{$t('errors.retry')}</a
					>{/if}
			</div>
		{:else if data.filters.q.length < 2}
			<p class="py-8 text-stone-600">{$t('search.minChars')}</p>
		{:else}
			<p class="text-sm text-stone-600">
				{$t(data.filters.match === 'words' ? 'search.similarHint' : 'search.phraseHint')}
			</p>
			<p class="pt-7 pb-2 text-sm text-stone-600" role="status">
				{$t(data.result.total === 1 ? 'search.oneResult' : 'search.resultCount', {
					count: data.result.total,
					query: data.filters.q
				})}
			</p>
			{#each data.result.results as result (`${result.type}:${result.id}`)}<LibraryResult
					{result}
					onplay={play}
				/>
			{:else}<p class="py-10 text-stone-600">{$t('search.noResults')}</p>{/each}
			<div class="mt-7">
				<Pagination
					current={data.filters.page}
					total={data.result.pages}
					getHref={(page) => libraryHref(data.filters, { page })}
				/>
			</div>
		{/if}
		<p class="mt-8 text-xs leading-relaxed text-stone-500 max-w-2xl">{$t('search.coverage')}</p>
	</div>
</section>

<style>
	.search-field {
		display: block;
		width: 100%;
		min-width: 0;
		min-height: 44px;
		padding: 8px 10px;
		border: 1px solid #d6d3d1;
		border-radius: 0;
		background: #faf8f3;
		color: #292524;
		font: inherit;
	}
	select.search-field {
		appearance: none;
		padding-right: 32px;
		background-image:
			linear-gradient(45deg, transparent 50%, #57534e 50%),
			linear-gradient(135deg, #57534e 50%, transparent 50%);
		background-position:
			right 17px center,
			right 12px center;
		background-size: 5px 5px;
		background-repeat: no-repeat;
	}
	@media (forced-colors: active) {
		select.search-field {
			appearance: auto;
			background-image: none;
		}
	}
	.mode-option {
		@apply flex min-h-11 cursor-pointer items-center justify-center border-b-2 border-transparent px-2 py-1 text-center text-sm font-medium text-stone-600 hover:bg-cream-dark sm:px-5;
	}
	.form-action {
		@apply inline-flex min-h-11 items-center justify-center px-3 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] transition-colors motion-reduce:transition-none sm:px-5 sm:text-[11px] sm:tracking-[0.16em];
	}
	.form-action:focus-visible,
	.search-field:focus-visible {
		outline: 2px solid #cc6a0a;
		outline-offset: 2px;
	}
	.filter-label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
		font-size: 13px;
		color: #57534e;
	}
</style>
