<script lang="ts">
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { formatFileSize } from '../../utils/FormatTime';
	import DocumentText1 from 'iconsax-svelte/DocumentText1.svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import AiOutlineDownload from 'svelte-icons-pack/ai/AiOutlineDownload';
	import AiFillPlayCircle from 'svelte-icons-pack/ai/AiFillPlayCircle';

	import ArrowDown2 from 'iconsax-svelte/ArrowDown2.svelte';
	import ArrowUp2 from 'iconsax-svelte/ArrowUp2.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ListSkeleton from '$lib/components/ListSkeleton.svelte';
	import ErrorCard from '$lib/components/ErrorCard.svelte';
	import ResultsSummary from '$lib/components/ResultsSummary.svelte';
	import { writable } from 'svelte/store';
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
	import { t } from '../../i18n';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let selectedDocument: SerializedTranscription | null = $state(null);
	const isDocumentOpen = writable(false);
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
	let currentPageNumber = $derived(Number($page.url.searchParams.get('page')) || data.pagination.page || 1);
	let currentLimit = $derived(data.pagination.limit);
	let sortOrder = $derived((
		$page.url.searchParams.get('sort') === 'asc'
			? 'asc'
			: $page.url.searchParams.get('sort') === 'desc'
				? 'desc'
				: data.sort || 'desc'
	) as 'asc' | 'desc');
	let selectedYear = $derived($page.url.searchParams.get('year') || data.selectedYear || '');
	let currentSearch = $derived($page.url.searchParams.get('search') || loadedSearch || '');
	let isDeferredData = $derived(Boolean((data as any).deferred));
	let requestKey = $derived(JSON.stringify({
		page: currentPageNumber,
		limit: currentLimit,
		sort: sortOrder,
		year: selectedYear || '',
		search: currentSearch || ''
	}));
	let dataRequestKey = $derived(JSON.stringify({
		page: data.pagination.page,
		limit: currentLimit,
		sort: (data.sort || 'desc') as 'asc' | 'desc',
		year: data.selectedYear || '',
		search: loadedSearch || ''
	}));
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
			listLoadError =
				error instanceof Error ? error.message : $t('transcriptions.loadFailed');
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
			await goto(url.toString(), { keepFocus: true });
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

	function handleSelectDocument(doc: SerializedTranscription) {
		selectedDocument = doc;
		isDocumentOpen.set(true);
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
				<h1 class="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] text-stone-900 mb-3">
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
		<div
			class="flex-1 min-w-0 {$isDocumentOpen ? 'lg:w-1/2' : 'w-full'} transition-all duration-300"
		>
			<!-- Sort and Filter Controls -->
			<div
				class="flex-col sm:flex-row justify-end mb-4 items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 px-2 sm:px-0 {$mobileFiltersOpen
					? 'flex'
					: 'hidden md:flex'}"
			>
				<div class="flex items-center space-x-2 w-full sm:w-auto">
					<label for="year-filter" class="text-sm text-stone-600 font-body">{$t('transcriptions.yearLabel')}</label>
					<select
						id="year-filter"
						class="border border-stone-200 px-3 py-2 text-sm font-body text-stone-700 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-missionnaire/30 focus:border-missionnaire/40 w-full sm:w-auto"
						value={selectedYear}
						onchange={handleYearChange}
					>
						<option value="">{$t('list.allYears')}</option>
						{#each years as year}
							<option value={year}>{year}</option>
						{/each}
					</select>
				</div>

				<button
					onclick={handleSort}
					class="flex items-center justify-center space-x-2 px-4 py-2 min-h-11 text-sm font-body text-stone-600 hover:text-missionnaire transition-colors duration-200 w-full sm:w-auto border sm:border-0 border-stone-200"
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
					<ResultsSummary from={summaryFrom} to={summaryTo} total={total} query={currentSearch} />
				</div>
				<div class="border border-stone-200/60 bg-white/40 mx-2 sm:mx-0">
					{#each documents as document (document._id)}
						<div
							class="flex items-center border-b border-stone-100 last:border-b-0 hover:bg-white/60"
						>
							<button
								class="flex-1 p-3 sm:p-4 flex items-start space-x-2 sm:space-x-4 text-left {selectedDocument?.filename ===
								document.filename
									? 'bg-stone-100'
									: ''}"
								onclick={() => handleSelectDocument(document)}
							>
								<div class="flex-shrink-0 pt-1">
									<DocumentText1 size={18} color="#6B7280" />
								</div>
								<div class="flex-1 min-w-0">
									<h3 class="text-xs sm:text-sm font-medium text-stone-800 break-words">
										{document.filename}
									</h3>
									<div class="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:space-x-6">
										<div class="text-xs text-stone-500 tabular-nums">
											{formatFileSize(document.size)}
										</div>
										<div class="text-xs text-stone-500 tabular-nums">
											{new Date(document.publishedOn).toLocaleDateString()}
										</div>
									</div>
								</div>
							</button>
							<div class="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4">
								{#if document.videoDisplayId}
									<a
										href={`https://www.youtube.com/watch?v=${document.videoDisplayId}`}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1.5 border border-stone-200 bg-white px-2 py-1 sm:px-2.5 sm:py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-stone-600 hover:border-red-500 hover:text-red-600 hover:bg-red-50 transition-colors duration-200 active:scale-[0.98]"
										title={$t('transcriptions.watchOnYoutube')}
									>
										<Icon src={AiFillPlayCircle} size="14" />
										<span class="hidden sm:inline">{$t('misc.video')}</span>
									</a>
								{/if}
								<a
									href={document.url}
									download
									class="inline-flex items-center gap-1.5 border border-stone-200 bg-white px-2 py-1 sm:px-2.5 sm:py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-stone-600 hover:border-missionnaire hover:text-missionnaire hover:bg-missionnaire/5 transition-colors duration-200 active:scale-[0.98]"
									title={$t('transcriptions.downloadPdf')}
								>
									<Icon src={AiOutlineDownload} size="14" />
									<span class="hidden sm:inline">PDF</span>
								</a>
							</div>
						</div>
					{/each}
				</div>

				{#if showPagination && totalPages > 1}
					<div class="mt-6 sm:mt-8">
						<Pagination
							current={currentPageNumber}
							total={totalPages}
							getHref={(p) => {
								const params = new URLSearchParams($page.url.searchParams);
								params.set('page', String(p));
								return `?${params.toString()}`;
							}}
						/>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Document Preview Panel -->
		{#if $isDocumentOpen && selectedDocument}
			<div
				class="fixed inset-0 lg:relative lg:w-1/2 border-l border-stone-200 bg-white p-4 sm:p-6 min-h-screen z-50 lg:z-auto"
			>
				<div class="flex flex-col h-full">
					<div class="flex justify-between items-start mb-4 sm:mb-6">
						<h2 class="text-lg sm:text-xl font-semibold text-stone-900 pr-8">
							{selectedDocument.filename}
						</h2>
						<button
							class="text-stone-400 hover:text-stone-600 transition-colors duration-200"
							onclick={() => isDocumentOpen.set(false)}
							aria-label={$t('misc.close')}
						>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>

					<div class="flex-1">
						<div class="mb-6">
							<dl class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
								<div>
									<dt class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-400 font-body">
										{$t('transcriptions.fileSize')}
									</dt>
									<dd class="mt-1 text-xs sm:text-sm text-stone-800 tabular-nums">
										{formatFileSize(selectedDocument.size)}
									</dd>
								</div>
								<div>
									<dt class="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-400 font-body">
										{$t('transcriptions.publishDate')}
									</dt>
									<dd class="mt-1 text-xs sm:text-sm text-stone-800 tabular-nums">
										{new Date(selectedDocument.publishedOn).toLocaleDateString()}
									</dd>
								</div>
							</dl>
						</div>

						<div
							class="relative w-full h-[calc(100vh-300px)] border border-stone-200 bg-stone-50 flex flex-col items-center justify-center p-4 sm:p-8 text-center"
						>
							<DocumentText1 size={40} color="#a8a29e" />
							<h3 class="mt-4 text-base sm:text-lg font-medium text-stone-900">
								{$t('transcriptions.previewHeading')}
							</h3>
							<p class="mt-2 text-xs sm:text-sm text-stone-500 max-w-md">
								{$t('transcriptions.previewBlocked')}
							</p>
							<div class="mt-4 sm:mt-6 flex flex-col gap-2 sm:gap-4 w-full px-4">
								<a
									href={selectedDocument.url}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center justify-center px-4 py-2 border border-stone-300 text-xs sm:text-sm font-medium text-stone-700 bg-white hover:border-missionnaire hover:text-missionnaire transition-colors duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire w-full"
								>
									<svg
										class="w-4 h-4 mr-2 -ml-1"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
										/>
									</svg>
									{$t('transcriptions.openNewTab')}
								</a>
								<a
									href={selectedDocument.url}
									download
									class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-xs sm:text-sm font-medium text-white bg-missionnaire hover:bg-missionnaire/90 transition-colors duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire w-full"
								>
									<div class="mr-2">
										<Icon src={AiOutlineDownload} size="16" />
									</div>
									{$t('transcriptions.downloadDocument')}
								</a>
								{#if selectedDocument.videoDisplayId}
									<a
										href={`https://www.youtube.com/watch?v=${selectedDocument.videoDisplayId}`}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center justify-center px-4 py-2 border border-stone-300 text-xs sm:text-sm font-medium text-stone-700 bg-white hover:border-missionnaire hover:text-missionnaire transition-colors duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire w-full"
									>
										<div class="mr-2">
											<Icon src={AiFillPlayCircle} size="16" />
										</div>
										{$t('transcriptions.watchRelated')}
									</a>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
