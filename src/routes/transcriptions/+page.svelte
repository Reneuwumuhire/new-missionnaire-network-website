<script lang="ts">
	import type { PageData } from './$types';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { formatFileSize } from '../../utils/FormatTime';
	import DocumentText1 from 'iconsax-svelte/DocumentText1.svelte';
	import Export from 'iconsax-svelte/Export.svelte';
	import VideoPlay from 'iconsax-svelte/VideoPlay.svelte';
	import ArrowDown2 from 'iconsax-svelte/ArrowDown2.svelte';
	import ArrowUp2 from 'iconsax-svelte/ArrowUp2.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import { writable } from 'svelte/store';
	import LoadingRing from '$lib/components/LoadingRing.svelte';
	import type { SerializedTranscription } from '$lib/server/transcriptions';
	import {
		getTranscriptionsCache,
		isTranscriptionsCacheFresh,
		setTranscriptionsCache,
		type TranscriptionsPageCacheEntry
	} from './listCache';

	export let data: PageData;
	let selectedDocument: SerializedTranscription | null = null;
	const isDocumentOpen = writable(false);
	let searchTerm = '';
	let isSearching = false;
	let searchInput: HTMLInputElement;
	let typingTimeout: ReturnType<typeof setTimeout>;
	let lastSearch = '';
	let lastSyncedSearch = '';

	let documents: SerializedTranscription[] = [];
	let total = 0;
	let years: number[] = [];
	let isListLoading = false;
	let listLoadError = '';
	let hasResolvedList = false;
	let abortController: AbortController | null = null;
	let currentRequestToken = 0;
	let lastHandledKey = '';

	$: initialDocuments = ((data as any).documents || []) as SerializedTranscription[];
	$: initialTotal = (data.pagination?.total || 0) as number;
	$: initialYears = ((data as any).years || []) as number[];
	$: loadedSearch = ((data as any).search || '') as string;
	$: currentPageNumber = Number($page.url.searchParams.get('page')) || data.pagination.page || 1;
	$: currentLimit = data.pagination.limit;
	$: sortOrder = (($page.url.searchParams.get('sort') === 'asc'
		? 'asc'
		: $page.url.searchParams.get('sort') === 'desc'
			? 'desc'
			: data.sort || 'desc') as 'asc' | 'desc');
	$: selectedYear = $page.url.searchParams.get('year') || data.selectedYear || '';
	$: currentSearch = $page.url.searchParams.get('search') || loadedSearch || '';
	$: isDeferredData = Boolean((data as any).deferred);
	$: requestKey = JSON.stringify({
		page: currentPageNumber,
		limit: currentLimit,
		sort: sortOrder,
		year: selectedYear || '',
		search: currentSearch || ''
	});
	$: dataRequestKey = JSON.stringify({
		page: data.pagination.page,
		limit: currentLimit,
		sort: (data.sort || 'desc') as 'asc' | 'desc',
		year: data.selectedYear || '',
		search: loadedSearch || ''
	});
	$: totalPages = Math.ceil(total / currentLimit);
	$: showPagination = total > 10;
	$: if (currentSearch !== lastSyncedSearch) {
		searchTerm = currentSearch;
		lastSearch = currentSearch;
		lastSyncedSearch = currentSearch;
	}

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
			if (!res.ok) throw new Error('Impossible de charger les transcriptions');

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
				error instanceof Error ? error.message : 'Impossible de charger les transcriptions';
			isSearching = false;
		} finally {
			if (token === currentRequestToken) isListLoading = false;
			if (abortController === controller) abortController = null;
		}
	}

	$: if (requestKey && requestKey !== lastHandledKey) {
		lastHandledKey = requestKey;
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

<svelte:head>
	<title>Transcriptions - Missionnaire Network</title>
	<meta
		name="description"
		content="Recherchez les transcriptions des prédications par année et par titre sur Missionnaire Network."
	/>
	<meta property="og:title" content="Transcriptions - Missionnaire Network" />
	<meta
		property="og:description"
		content="Bibliothèque de transcriptions du Message pour étude et édification."
	/>
</svelte:head>

<div class="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
	<!-- Search Header -->
	<div class="relative mb-4 sm:mb-8">
		<div class="flex flex-row items-center justify-center">
			<div class="w-full max-w-4xl text-center">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body"
				>
					Transcriptions
				</p>
				<h1 class="font-display text-2xl sm:text-3xl font-semibold text-stone-900 mb-2">
					Transcriptions
				</h1>
				<p class="text-sm text-stone-500 font-body mb-2">
					Trouvez les transcriptions des prédications
				</p>
				<p class="text-[12px] text-stone-400 font-body mb-6">
					{#if hasResolvedList}
						{total} transcription{total > 1 ? 's' : ''} disponible{total > 1 ? 's' : ''}
					{:else}
						<span class="inline-block h-3 w-32 rounded-full bg-stone-200 animate-pulse"></span>
					{/if}
				</p>
				<form
					class="flex w-full max-w-xl mx-auto border border-stone-200/60 bg-white/40 overflow-hidden"
					on:submit|preventDefault={() =>
						handleSearch(searchInput?.value ?? searchTerm, { immediate: true })}
				>
					<div class="relative flex-1">
						<input
							type="text"
							class="w-full bg-transparent text-stone-800 px-5 py-3.5 pr-24 text-sm font-body outline-none placeholder:text-stone-400"
							placeholder="Rechercher par titre..."
							bind:value={searchTerm}
							bind:this={searchInput}
							on:focus={handleFocus}
							on:input={(event) =>
								handleSearch((event.currentTarget as HTMLInputElement).value)}
						/>
						{#if isSearching}
							<LoadingRing
								size={16}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-missionnaire/90"
							/>
						{:else if searchTerm}
							<button
								type="button"
								aria-label="Effacer la recherche"
								title="Effacer"
								class="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
								on:click={() => {
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
						class="bg-missionnaire hover:bg-missionnaire/90 text-white px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-colors shrink-0"
					>
						Rechercher
					</button>
				</form>
			</div>
		</div>
	</div>

	<div class="flex w-full h-full flex-col lg:flex-row">
		<!-- List Panel -->
		<div
			class="flex-1 min-w-0 {$isDocumentOpen ? 'lg:w-1/2' : 'w-full'} transition-all duration-300"
		>
			<!-- Sort and Filter Controls -->
			<div
				class="flex flex-col sm:flex-row justify-end mb-4 items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 px-2 sm:px-0"
			>
				<div class="flex items-center space-x-2 w-full sm:w-auto">
					<label for="year-filter" class="text-sm text-gray-600">Année:</label>
					<select
						id="year-filter"
						class="border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-missionnaire focus:border-transparent w-full sm:w-auto"
						value={selectedYear}
						on:change={handleYearChange}
					>
						<option value="">Toutes les années</option>
						{#each years as year}
							<option value={year}>{year}</option>
						{/each}
					</select>
				</div>

				<button
					on:click={handleSort}
					class="flex items-center justify-center space-x-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 w-full sm:w-auto border sm:border-0 border-gray-300 rounded-md sm:rounded-none"
				>
					<span>Date de publication</span>
					{#if sortOrder === 'desc'}
						<ArrowDown2 size={20} />
					{:else}
						<ArrowUp2 size={20} />
					{/if}
				</button>
			</div>

			{#if isListLoading && !hasResolvedList}
				<div class="border border-gray-300 shadow rounded-md mx-2 sm:mx-0 divide-y divide-gray-200">
					{#each Array.from({ length: 8 }) as _}
						<div class="flex items-center p-3 sm:p-4 animate-pulse">
							<div class="flex-shrink-0 pt-1 mr-2 sm:mr-4">
								<div class="h-4 w-4 rounded bg-stone-200"></div>
							</div>
							<div class="flex-1 min-w-0 space-y-2">
								<div class="h-4 w-3/4 rounded-full bg-stone-200"></div>
								<div class="h-3 w-1/3 rounded-full bg-stone-100"></div>
							</div>
							<div class="flex items-center space-x-2 px-2 sm:px-4">
								<div class="h-5 w-5 rounded bg-stone-100"></div>
								<div class="h-5 w-5 rounded bg-stone-100"></div>
							</div>
						</div>
					{/each}
				</div>
			{:else if listLoadError && !hasResolvedList}
				<div class="text-center py-12">
					<p class="text-stone-500 text-sm sm:text-base">{listLoadError}</p>
					<button
						class="mt-4 inline-flex items-center rounded-full border border-missionnaire px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-missionnaire transition-colors hover:bg-missionnaire/5"
						on:click={() => void loadInBackground({ showLoading: true })}
					>
						Réessayer
					</button>
				</div>
			{:else if documents.length === 0}
				<div class="text-center py-12">
					<p class="text-gray-600 text-sm sm:text-base">Aucun document trouvé</p>
				</div>
			{:else}
				{#if isListLoading}
					<div
						class="mx-2 sm:mx-0 mb-2 border border-stone-200/60 bg-stone-50/70 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400"
					>
						Mise à jour de la liste...
					</div>
				{/if}
				<div class="border border-gray-300 shadow rounded-md mx-2 sm:mx-0">
					{#each documents as document (document._id)}
						<div
							class="flex items-center border-b border-gray-200 last:border-b-0 hover:bg-gray-50"
						>
							<button
								class="flex-1 p-3 sm:p-4 flex items-start space-x-2 sm:space-x-4 text-left {selectedDocument?.filename ===
								document.filename
									? 'bg-gray-100'
									: ''}"
								on:click={() => handleSelectDocument(document)}
							>
								<div class="flex-shrink-0 pt-1">
									<DocumentText1 size={18} color="#6B7280" />
								</div>
								<div class="flex-1 min-w-0">
									<h3 class="text-xs sm:text-sm font-medium text-gray-900 break-words">
										{document.filename}
									</h3>
									<div class="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:space-x-6">
										<div class="text-xs text-gray-500">
											{formatFileSize(document.size)}
										</div>
										<div class="text-xs text-gray-500">
											{new Date(document.publishedOn).toLocaleDateString()}
										</div>
									</div>
								</div>
							</button>
							<div class="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-4">
								{#if document.videoDisplayId}
									<a
										href={`https://www.youtube.com/watch?v=${document.videoDisplayId}`}
										target="_blank"
										rel="noopener noreferrer"
										class="p-1 sm:p-2 text-gray-500 hover:text-missionnaire transition-colors"
										title="Voir la vidéo"
									>
										<VideoPlay size={18} />
									</a>
								{/if}
								<a
									href={document.url}
									download
									class="p-1 sm:p-2 text-gray-500 hover:text-missionnaire transition-colors"
									title="Télécharger"
								>
									<Export size={18} />
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
				class="fixed inset-0 lg:relative lg:w-1/2 border-l border-gray-200 bg-white p-4 sm:p-6 min-h-screen z-50 lg:z-auto"
			>
				<div class="flex flex-col h-full">
					<div class="flex justify-between items-start mb-4 sm:mb-6">
						<h2 class="text-lg sm:text-xl font-semibold text-gray-900 pr-8">
							{selectedDocument.filename}
						</h2>
						<button
							class="text-gray-400 hover:text-gray-500"
							on:click={() => isDocumentOpen.set(false)}
							aria-label="Fermer"
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
									<dt class="text-xs sm:text-sm font-medium text-gray-500">Taille du fichier</dt>
									<dd class="mt-1 text-xs sm:text-sm text-gray-900">
										{formatFileSize(selectedDocument.size)}
									</dd>
								</div>
								<div>
									<dt class="text-xs sm:text-sm font-medium text-gray-500">Date de publication</dt>
									<dd class="mt-1 text-xs sm:text-sm text-gray-900">
										{new Date(selectedDocument.publishedOn).toLocaleDateString()}
									</dd>
								</div>
							</dl>
						</div>

						<div
							class="relative w-full h-[calc(100vh-300px)] border border-gray-200 rounded-lg bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-8 text-center"
						>
							<DocumentText1 size={40} color="#9CA3AF" />
							<h3 class="mt-4 text-base sm:text-lg font-medium text-gray-900">
								Visualisation du document
							</h3>
							<p class="mt-2 text-xs sm:text-sm text-gray-500 max-w-md">
								Pour des raisons de sécurité, la prévisualisation du document peut être bloquée par
								votre navigateur. Vous pouvez :
							</p>
							<div class="mt-4 sm:mt-6 flex flex-col gap-2 sm:gap-4 w-full px-4">
								<a
									href={selectedDocument.url}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire w-full"
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
									Ouvrir dans un nouvel onglet
								</a>
								<a
									href={selectedDocument.url}
									download
									class="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-missionnaire hover:bg-missionnaire/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire w-full"
								>
									<div class="mr-2">
										<Export size={16} />
									</div>
									Télécharger le document
								</a>
								{#if selectedDocument.videoDisplayId}
									<a
										href={`https://www.youtube.com/watch?v=${selectedDocument.videoDisplayId}`}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-missionnaire w-full"
									>
										<div class="mr-2">
											<VideoPlay size={16} />
										</div>
										Voir la vidéo associée
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
