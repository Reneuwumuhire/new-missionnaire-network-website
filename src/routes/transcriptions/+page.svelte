<script lang="ts">
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { formatFileSize } from '../../utils/FormatTime';
	import DocumentText1 from 'iconsax-svelte/DocumentText1.svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import AiOutlineDownload from 'svelte-icons-pack/ai/AiOutlineDownload';
	import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import { transcriptTitle } from '$lib/utils/transcriptTitle';

	import ArrowDown2 from 'iconsax-svelte/ArrowDown2.svelte';
	import ArrowUp2 from 'iconsax-svelte/ArrowUp2.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ListSkeleton from '$lib/components/ListSkeleton.svelte';
	import ErrorCard from '$lib/components/ErrorCard.svelte';
	import ResultsSummary from '$lib/components/ResultsSummary.svelte';
	import LoadingRing from '$lib/components/LoadingRing.svelte';
	import type { SerializedTranscription } from '$lib/server/transcriptions';
	import {
		getTranscriptionsCache,
		isTranscriptionsCacheFresh,
		setTranscriptionsCache,
		type TranscriptionsPageCacheEntry
	} from './listCache';
	import MobileListToolbar from '$lib/components/+mobileListToolbar.svelte';
	import { mobileSearchOpen, mobileFiltersOpen } from '$lib/stores/mobileControls';
	import { t, locale } from '../../i18n';

	const rowActionClass =
		'inline-flex h-11 w-11 shrink-0 items-center justify-center transition-colors hover:text-missionnaire focus-visible:outline-2 focus-visible:outline-missionnaire';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let searchTerm = $state('');
	let isSearching = $state(false);
	let searchInput: HTMLInputElement | undefined = $state();
	let typingTimeout: ReturnType<typeof setTimeout>;
	let lastSearch = $state('');
	let lastSyncedSearch = $state('');

	let documents: SerializedTranscription[] = $state([]);
	let total = $state(0);
	let years: number[] = $state([]);
	let isListLoading = $state(false);
	let listLoadError = $state('');
	let hasResolvedList = $state(false);
	let abortController: AbortController | null = null;
	let currentRequestToken = 0;
	let lastHandledKey = $state('');

	let initialDocuments = $derived(((data as any).documents || []) as SerializedTranscription[]);
	let initialTotal = $derived((data.pagination?.total || 0) as number);
	let initialYears = $derived(((data as any).years || []) as number[]);
	let loadedSearch = $derived(((data as any).search || '') as string);
	let currentPageNumber = $derived(
		Number(page.url.searchParams.get('page')) || data.pagination.page || 1
	);
	let currentLimit = $derived(data.pagination.limit);
	let sortOrder = $derived(
		(page.url.searchParams.get('sort') === 'asc'
			? 'asc'
			: page.url.searchParams.get('sort') === 'desc'
				? 'desc'
				: data.sort || 'desc') as 'asc' | 'desc'
	);
	let selectedYear = $derived(page.url.searchParams.get('year') || data.selectedYear || '');
	let currentSearch = $derived(page.url.searchParams.get('search') || loadedSearch || '');
	let isDeferredData = $derived(Boolean((data as any).deferred));
	let requestKey = $derived(
		JSON.stringify({
			page: currentPageNumber,
			limit: currentLimit,
			sort: sortOrder,
			year: selectedYear || '',
			search: currentSearch || ''
		})
	);
	let dataRequestKey = $derived(
		JSON.stringify({
			page: data.pagination.page,
			limit: currentLimit,
			sort: (data.sort || 'desc') as 'asc' | 'desc',
			year: data.selectedYear || '',
			search: loadedSearch || ''
		})
	);
	let totalPages = $derived(Math.ceil(total / currentLimit));
	let showPagination = $derived(total > 10);
	let summaryFrom = $derived(total === 0 ? 0 : (currentPageNumber - 1) * currentLimit + 1);
	let summaryTo = $derived(Math.min(currentPageNumber * currentLimit, total));
	$effect(() => {
		if (currentSearch !== lastSyncedSearch) {
			searchTerm = currentSearch;
			lastSearch = currentSearch;
			untrack(() => {
				lastSyncedSearch = currentSearch;
			});
		}
	});

	function abortRequest() {
		abortController?.abort();
		abortController = null;
	}

	function applyData(payload: TranscriptionsPageCacheEntry) {
		documents = payload.documents;
		total = payload.total;
		years = payload.years;
		isSearching = false;
		hasResolvedList = true;
	}

	async function loadInBackground(options?: { showLoading?: boolean }) {
		const showLoading = options?.showLoading ?? true;
		const key = requestKey;
		const token = ++currentRequestToken;
		const controller = new AbortController();
		abortRequest();
		abortController = controller;
		if (showLoading || !hasResolvedList) isListLoading = true;

		try {
			const params = new URLSearchParams({
				page: String(currentPageNumber),
				limit: String(currentLimit),
				sort: sortOrder
			});
			if (selectedYear) params.set('year', selectedYear);
			if (currentSearch) params.set('search', currentSearch);

			const res = await fetch(`/api/transcriptions?${params.toString()}`, {
				signal: controller.signal
			});

			if (token !== currentRequestToken || key !== requestKey) return;
			if (!res.ok) throw new Error($t('transcriptions.loadFailed'));

			const r = await res.json();
			const cached = setTranscriptionsCache(key, {
				documents: (r.data || []) as SerializedTranscription[],
				total: (r.total || 0) as number,
				years: (r.years || years || []) as number[]
			});
			applyData(cached);
			listLoadError = '';
		} catch (error) {
			if ((error as Error).name === 'AbortError') return;
			if (token !== currentRequestToken || key !== requestKey) return;
			listLoadError = error instanceof Error ? error.message : $t('transcriptions.loadFailed');
			isSearching = false;
		} finally {
			if (token === currentRequestToken) isListLoading = false;
			if (abortController === controller) abortController = null;
		}
	}

	$effect(() => {
		if (requestKey && requestKey !== lastHandledKey) {
			untrack(() => {
				lastHandledKey = requestKey;
			});
			listLoadError = '';

			const cachedEntry = getTranscriptionsCache(requestKey);

			if (!isDeferredData && dataRequestKey === requestKey) {
				const seeded = setTranscriptionsCache(requestKey, {
					documents: initialDocuments,
					total: initialTotal,
					years: initialYears
				});
				abortRequest();
				applyData(seeded);
				isListLoading = false;
			} else if (cachedEntry) {
				applyData(cachedEntry);
				void loadInBackground({ showLoading: !isTranscriptionsCacheFresh(cachedEntry) });
			} else {
				abortRequest();
				documents = [];
				hasResolvedList = false;
				void loadInBackground({ showLoading: true });
			}
		}
	});

	async function runSearch(value: string) {
		const trimmed = value.trim();
		const url = new URL(window.location.href);
		if (trimmed) {
			url.searchParams.set('search', trimmed);
		} else {
			url.searchParams.delete('search');
		}
		url.searchParams.set('page', '1');
		try {
			await goto(url.toString(), { reset: false });
		} catch {
			isSearching = false;
		}
	}

	function handleSearch(value: string, options?: { immediate?: boolean }) {
		if (!browser) return;
		clearTimeout(typingTimeout);
		const trimmed = value.trim();
		if (trimmed === lastSearch) {
			isSearching = false;
			return;
		}
		isSearching = true;
		if (options?.immediate) {
			void runSearch(value);
			return;
		}
		typingTimeout = setTimeout(() => {
			void runSearch(value);
		}, 500);
	}

	function handleFocus(event: FocusEvent) {
		const input = event.target as HTMLInputElement;
		input.focus();
	}

	function handleSort() {
		if (browser) {
			const newSort = sortOrder === 'asc' ? 'desc' : 'asc';
			const url = new URL(window.location.href);
			url.searchParams.set('sort', newSort);
			goto(url.toString());
		}
	}

	function handleYearChange(e: Event) {
		if (browser) {
			const url = new URL(window.location.href);
			const year = (e.target as HTMLSelectElement).value;
			if (year) {
				url.searchParams.set('year', year);
			} else {
				url.searchParams.delete('year');
			}
			url.searchParams.set('page', '1');
			goto(url.toString());
		}
	}

	onMount(() => {
		if (browser) {
			const url = new URL(window.location.href);
			searchTerm = url.searchParams.get('search') || '';
			lastSearch = searchTerm;
			if (searchTerm && searchInput) {
				searchInput.focus();
			}
		}
		window.scrollTo(0, 0);
	});

	onDestroy(() => abortRequest());
</script>

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->

<div class="container mx-auto px-2 pt-4 pb-4 sm:px-4 sm:pt-6 sm:pb-8">
	<!-- Search Header -->
	<div class="relative mb-6 md:mb-8">
		<div class="flex flex-row items-center justify-center">
			<div class="w-full max-w-4xl text-center">
				<p
					class="text-[10px] font-semibold uppercase tracking-[0.3em] text-missionnaire mb-3 font-body"
				>
					Missionnaire Network
				</p>
				<h1
					class="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] text-stone-900 mb-3"
				>
					{$t('nav.transcriptions')}
				</h1>
				<p class="text-sm text-stone-500 font-body mb-2">
					{$t('transcriptions.findIntro')}
				</p>
				<p class="text-[12px] text-stone-400 font-body tabular-nums mb-2 md:mb-6">
					{#if hasResolvedList}
						{total > 1
							? $t('transcriptions.availableMany', { count: total })
							: $t('transcriptions.availableOne', { count: total })}
					{:else}
						<span class="inline-block h-3 w-32 rounded-full bg-stone-200 animate-pulse"></span>
					{/if}
				</p>
				<form
					class="hidden md:flex w-full max-w-xl mx-auto border border-stone-200/60 bg-white/40 overflow-hidden transition-shadow focus-within:border-missionnaire/40 focus-within:ring-2 focus-within:ring-missionnaire/30"
					onsubmit={(e) => {
						e.preventDefault();
						handleSearch(searchInput?.value ?? searchTerm, { immediate: true });
					}}
				>
					<div class="relative flex-1">
						<input
							type="text"
							class="w-full bg-transparent text-stone-800 px-5 py-3.5 pr-24 text-sm font-body outline-none placeholder:text-stone-400"
							placeholder={$t('transcriptions.searchByTitle')}
							bind:value={searchTerm}
							bind:this={searchInput}
							onfocus={handleFocus}
							oninput={(event) => handleSearch((event.currentTarget as HTMLInputElement).value)}
						/>
						{#if isSearching}
							<LoadingRing
								size={16}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-missionnaire/90"
							/>
						{:else if searchTerm}
							<button
								type="button"
								aria-label={$t('search.clear')}
								title={$t('search.clearShort')}
								class="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
								onclick={() => {
									searchTerm = '';
									handleSearch('', { immediate: true });
								}}
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M6 6l12 12M6 18L18 6" />
								</svg>
							</button>
						{/if}
					</div>
					<button
						type="submit"
						class="bg-missionnaire hover:bg-missionnaire/90 text-white px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-all duration-200 active:scale-[0.98] shrink-0"
					>
						{$t('search.action')}
					</button>
				</form>
			</div>
		</div>
	</div>

	<!-- Mobile compact toolbar: collapses search + filters so the
	     transcription list is the priority on arrival. The negative
	     margins break it out of the page container's padding; keeping it
	     a direct child of that container gives `position: sticky` a
	     full-height parent so the bar stays pinned down the whole list. -->
	<MobileListToolbar class="-mx-2 sm:-mx-4" />
	{#if $mobileSearchOpen}
		<div class="md:hidden -mx-2 sm:-mx-4 border-b border-stone-200 bg-cream px-4 py-3">
			<div class="relative">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="search"
					class="w-full min-h-11 border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-base font-body text-stone-800 outline-none placeholder:text-stone-400 focus:border-missionnaire/40 focus:ring-2 focus:ring-missionnaire/30"
					placeholder={$t('transcriptions.searchByTitle')}
					bind:value={searchTerm}
					oninput={(event) => handleSearch((event.currentTarget as HTMLInputElement).value)}
					autofocus
				/>
				<svg
					class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="7" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
			</div>
		</div>
	{/if}

	<div class="flex w-full h-full flex-col lg:flex-row mt-4 md:mt-0">
		<!-- List Panel -->
		<div class="w-full min-w-0">
			<!-- Sort and Filter Controls -->
			<div
				class="flex-col sm:flex-row justify-end mb-4 items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 px-2 sm:px-0 {$mobileFiltersOpen
					? 'flex'
					: 'hidden md:flex'}"
			>
				<div class="flex items-center space-x-2 w-full sm:w-auto">
					<label for="year-filter" class="text-sm text-stone-600 font-body"
						>{$t('transcriptions.yearLabel')}</label
					>
					<div class="relative min-w-0 flex-1 sm:flex-none">
						<select
							id="year-filter"
							class="w-full appearance-none border border-stone-200 bg-white py-2 pr-9 pl-3 font-body text-sm tabular-nums text-stone-700 focus:border-missionnaire/40 focus:ring-2 focus:ring-missionnaire/30 focus:outline-none"
							value={selectedYear}
							onchange={handleYearChange}
						>
							<option value="">{$t('list.allYears')}</option>
							{#each years as year}
								<option value={year}>{year}</option>
							{/each}
						</select>
						<svg
							aria-hidden="true"
							class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-stone-600"
							viewBox="0 0 20 20"
							fill="none"
						>
							<path
								d="m5 7.5 5 5 5-5"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="1.5"
							/>
						</svg>
					</div>
				</div>

				<button
					onclick={handleSort}
					class="flex min-h-11 w-full items-center justify-center gap-2 border border-stone-200 bg-white px-4 text-xs font-semibold text-stone-600 transition-colors hover:text-missionnaire sm:w-auto md:hidden"
				>
					<span>{$t('transcriptions.publishDate')}</span>
					{#if sortOrder === 'desc'}
						<ArrowDown2 size={20} />
					{:else}
						<ArrowUp2 size={20} />
					{/if}
				</button>
			</div>

			{#if isListLoading && !hasResolvedList}
				<div class="border border-stone-200/60 bg-white/40 mx-2 sm:mx-0">
					<ListSkeleton rows={8} />
				</div>
			{:else if listLoadError && !hasResolvedList}
				<div class="mx-2 sm:mx-0">
					<ErrorCard
						message={listLoadError}
						onRetry={() => void loadInBackground({ showLoading: true })}
					/>
				</div>
			{:else if documents.length === 0}
				<div class="py-24 text-center">
					<div
						class="bg-stone-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-200"
					>
						<DocumentText1 size={32} color="#e7e5e4" />
					</div>
					<h3 class="text-xl font-bold text-stone-800 mb-2">
						{$t('transcriptions.noDocuments')}
					</h3>
					<p class="text-stone-400 text-sm">
						{$t('list.tryAdjustFilters')}
					</p>
				</div>
			{:else}
				{#if isListLoading}
					<div
						class="mx-2 sm:mx-0 mb-2 border border-stone-200/60 bg-stone-50/70 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400"
					>
						{$t('list.updating')}
					</div>
				{/if}
				<div class="mb-2 px-2 sm:px-0">
					<ResultsSummary from={summaryFrom} to={summaryTo} {total} query={currentSearch} />
				</div>
				<div class="mx-2 border border-stone-200/60 bg-white/40 sm:mx-0">
					<table class="w-full table-fixed text-left" aria-label={$t('nav.transcriptions')}>
						<thead
							class="border-b border-stone-200/60 bg-white/40 text-[10px] font-bold uppercase tracking-widest text-stone-500 md:text-[11px]"
						>
							<tr>
								<th scope="col" class="hidden w-12 py-3 text-center md:table-cell">#</th>
								<th scope="col" class="px-3 py-3 md:px-4">{$t('list.title')}</th>
								<th
									scope="col"
									aria-sort={sortOrder === 'desc' ? 'descending' : 'ascending'}
									class="hidden w-32 px-4 py-3 md:table-cell"
								>
									<button
										type="button"
										onclick={handleSort}
										class="inline-flex items-center gap-1.5 hover:text-missionnaire"
									>
										<span aria-hidden="true" class="text-missionnaire"
											>{sortOrder === 'desc' ? '↓' : '↑'}</span
										>
										{$t('list.date')}
									</button>
								</th>
								<th scope="col" class="hidden w-24 px-4 py-3 md:table-cell"
									>{$t('transcriptions.fileSize')}</th
								>
								<th scope="col" class="w-36 py-3 text-center md:w-40">{$t('list.actions')}</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-stone-100">
							{#each documents as document, index (document._id)}
								{@const { title } = transcriptTitle(document.filename)}
								{@const published = new Date(document.publishedOn).toLocaleDateString($locale, {
									timeZone: 'UTC'
								})}
								{@const size = formatFileSize(document.size)}
								<tr class="transition-colors hover:bg-white/60 focus-within:bg-white/60">
									<td
										class="hidden py-4 text-center text-xs font-bold tabular-nums text-stone-400 md:table-cell"
										>{summaryFrom + index}</td
									>
									<td class="px-3 py-4 md:px-4">
										<a
											href={`/transcriptions/${document._id}`}
											class="block break-words text-sm font-bold leading-snug text-stone-900 hover:text-missionnaire"
										>
											{title}
										</a>
										<div
											class="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-stone-500 md:hidden"
										>
											<span>{published}</span>
											<span>{size}</span>
										</div>
									</td>
									<td class="hidden px-4 py-4 text-xs tabular-nums text-stone-500 md:table-cell"
										>{published}</td
									>
									<td class="hidden px-4 py-4 text-xs tabular-nums text-stone-500 md:table-cell"
										>{size}</td
									>
									<td class="py-2 md:py-4">
										<div class="flex items-center justify-center">
											<a
												href={document.url}
												target="_blank"
												rel="noopener noreferrer"
												class={`${rowActionClass} text-gray-400`}
												aria-label={$t('predications.openPdf')}
												title={$t('predications.openPdf')}
											>
												<Icon src={BsFileEarmarkPdfFill} size="18" />
											</a>
											<a
												href={document.url}
												download
												class={rowActionClass}
												aria-label={$t('transcriptions.downloadPdf')}
												title={$t('transcriptions.downloadPdf')}
											>
												<Icon src={AiOutlineDownload} size="20" />
											</a>
											{#if document.replayId || document.videoDisplayId}
												{@const playLabel = $t(
													document.replayId
														? 'transcriptions.openReplay'
														: 'transcriptions.watchOnYoutube'
												)}
												<a
													href={document.replayId
														? `/live/rediffusions/${document.replayId}`
														: `https://www.youtube.com/watch?v=${encodeURIComponent(document.videoDisplayId ?? '')}`}
													target={document.replayId ? undefined : '_blank'}
													rel={document.replayId ? undefined : 'noopener noreferrer'}
													class={rowActionClass}
													aria-label={playLabel}
													title={playLabel}
												>
													<Icon src={IoPlayCircle} size="24" />
												</a>
											{:else}
												<span class="w-11 shrink-0" aria-hidden="true"></span>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if showPagination && totalPages > 1}
					<div class="mt-6 sm:mt-8">
						<Pagination
							current={currentPageNumber}
							total={totalPages}
							getHref={(p) => {
								const params = new URLSearchParams(page.url.searchParams);
								params.set('page', String(p));
								return `?${params.toString()}`;
							}}
						/>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
