<script lang="ts">
	import { t } from '../../i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { Sermon } from '$lib/models/sermon';
	import type { PublishedRecording } from '$lib/server/recordings';
	import { basePlaylist, playlist, isShuffle } from '$lib/stores/global';
	import { mobileFiltersOpen } from '$lib/stores/mobileControls';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsArrowUp from 'svelte-icons-pack/bs/BsArrowUp';
	import BsArrowDown from 'svelte-icons-pack/bs/BsArrowDown';
	import SermonTableItem from '$lib/components/SermonTableItem.svelte';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import { createPlayableSermon } from '../../utils/audioPlayback';
	import RetransmissionTableItem from '$lib/components/RetransmissionTableItem.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import ListSkeleton from '$lib/components/ListSkeleton.svelte';
	import ErrorCard from '$lib/components/ErrorCard.svelte';
	import ResultsSummary from '$lib/components/ResultsSummary.svelte';
	import { onDestroy, untrack } from 'svelte';
	import {
		areAuthorsFresh,
		areYearsFresh,
		getCachedAuthors,
		getCachedYears,
		getPredicationsPageCache,
		isPredicationsPageCacheFresh,
		setCachedAuthors,
		setCachedYears,
		setPredicationsPageCache,
		type PredicationsPageCacheEntry
	} from './listCache';

	let { data } = $props();

	let sermons: Sermon[] = $state([]);
	let recordings: PublishedRecording[] = $state([]);
	let recordingsTotal = $state(0);
	let showBlendedRetransmissions = $state(false);
	let totalSermons = $state(0);
	let years: string[] = $state([]);
	let availableAuthors: string[] = $state([]);
	let filterType: 'sermon' | 'retransmission' = $state('sermon');
	let isListLoading = $state(false);
	let listLoadError = $state('');
	let hasResolvedList = $state(false);
	let abortController: AbortController | null = null;
	let currentRequestToken = 0;
	let lastHandledKey = $state('');

	let initialSermons = $derived(((data as any).sermons || []) as Sermon[]);
	let initialRecordings = $derived(((data as any).recordings || []) as PublishedRecording[]);
	let initialRecordingsTotal = $derived(((data as any).recordingsTotal || 0) as number);
	let initialShowBlended = $derived(Boolean((data as any).showBlendedRetransmissions));
	let initialTotal = $derived(((data as any).total || 0) as number);
	let initialYears = $derived(((data as any).years || []) as string[]);
	let initialAuthors = $derived(((data as any).availableAuthors || []) as string[]);
	let initialFilterType = $derived(((data as any).filterType || 'sermon') as 'sermon' | 'retransmission');
	let currentAuthor = $derived((data as any).author);
	let currentSearch = $derived((data as any).search);
	let currentAlpha = $derived((data as any).alpha);
	let currentYear = $derived((data as any).year);
	let currentHasAudio = $derived((data as any).hasAudio);
	let currentSort = $derived((data as any).sort || 'iso_date:desc');
	let currentPage = $derived((data as any).page);
	let limit = $derived((data as any).limit);
	let currentLanguage = $derived((data as any).language || 'french');
	let isDeferredData = $derived(Boolean((data as any).deferred));
	let requestKey = $derived(JSON.stringify({
		author: currentAuthor || 'Tous',
		search: currentSearch || '',
		alpha: currentAlpha || '',
		year: currentYear || '',
		hasAudio: !!currentHasAudio,
		sort: currentSort || 'iso_date:desc',
		language: currentLanguage || 'french',
		page: currentPage || 1,
		limit: limit || 100
	}));
	let totalPages = $derived(Math.ceil(totalSermons / limit));
	let summaryFrom = $derived(totalSermons === 0 ? 0 : (currentPage - 1) * limit + 1);
	let summaryTo = $derived(Math.min(currentPage * limit, totalSermons));
	let blendedOnly =
		$derived(filterType === 'sermon' &&
		sermons.length === 0 &&
		showBlendedRetransmissions &&
		recordings.length > 0);
	let playlistSermons =
		$derived(filterType === 'sermon'
			? sermons.map((sermon: Sermon) =>
					createPlayableSermon(sermon, currentLanguage === 'english' ? 'english' : 'french')
				)
			: []);

	const desktopSermonGrid = 'md:grid-cols-[30px_minmax(0,2.5fr)_minmax(0,1.35fr)_110px_80px_120px]';
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
	let authors = $derived(['Tous', ...(availableAuthors ?? [])]);

	function abortRequest() {
		abortController?.abort();
		abortController = null;
	}

	function applyData(payload: PredicationsPageCacheEntry) {
		filterType = payload.filterType;
		sermons = payload.sermons;
		recordings = payload.recordings;
		recordingsTotal = payload.recordingsTotal;
		showBlendedRetransmissions = payload.showBlendedRetransmissions;
		totalSermons = payload.total;
		years = payload.years;
		availableAuthors = payload.availableAuthors;
		hasResolvedList = true;
	}

	function sermonSortToRecordingSort(sort: string) {
		const [property, order] = sort.split(':');
		const dir = order === 'asc' ? 'asc' : 'desc';
		switch (property) {
			case 'french_title':
				return { field: 'title', order: dir };
			case 'iso_date':
				return { field: 'started_at', order: dir };
			case 'duration':
				return { field: 'duration_sec', order: dir };
			default:
				return { field: 'started_at', order: 'desc' as 'asc' | 'desc' };
		}
	}

	async function loadInBackground(options?: { showLoading?: boolean }) {
		const showLoading = options?.showLoading ?? true;
		const key = requestKey;
		const token = ++currentRequestToken;
		const isRetransmissions = currentAuthor === 'Retransmissions';
		const isBlendedSearch = currentAuthor === 'Tous' && (currentSearch || '').trim().length > 0;

		const sermonParams = new URLSearchParams({
			author: currentAuthor || 'Tous',
			search: currentSearch || '',
			alpha: currentAlpha || '',
			year: currentYear || '',
			hasAudio: String(!!currentHasAudio),
			language: currentLanguage || 'french',
			pageNumber: String(currentPage || 1),
			limit: String(limit || 100),
			sort: currentSort || 'iso_date:desc'
		});

		const sortMapped = sermonSortToRecordingSort(currentSort);
		const retransmissionLimit = isRetransmissions ? Number(limit || 100) : 12;
		const retransmissionPage = isRetransmissions ? Number(currentPage || 1) : 1;
		const retransmissionParams = new URLSearchParams({
			limit: String(retransmissionLimit),
			pageNumber: String(retransmissionPage),
			sortField: sortMapped.field,
			sortOrder: sortMapped.order
		});
		if (currentSearch) retransmissionParams.set('q', currentSearch);
		if (currentYear) retransmissionParams.set('year', currentYear);

		const fetchAuthors = !areAuthorsFresh() || availableAuthors.length === 0;
		const fetchYears = !areYearsFresh() || years.length === 0;
		const wantsSermons = !isRetransmissions;
		const wantsRetransmissions = isRetransmissions || isBlendedSearch;

		const controller = new AbortController();
		abortRequest();
		abortController = controller;
		if (showLoading || !hasResolvedList) isListLoading = true;

		try {
			const [sermonRes, retransmissionRes, yearsRes, authorsRes] = await Promise.all([
				wantsSermons
					? fetch(`/api/sermons?${sermonParams.toString()}`, { signal: controller.signal })
					: Promise.resolve(null),
				wantsRetransmissions
					? fetch(`/api/retransmissions?${retransmissionParams.toString()}`, {
							signal: controller.signal
						})
					: Promise.resolve(null),
				fetchYears
					? fetch('/api/sermon-years', { signal: controller.signal })
					: Promise.resolve(null),
				fetchAuthors
					? fetch('/api/sermon-authors', { signal: controller.signal })
					: Promise.resolve(null)
			]);

			if (token !== currentRequestToken || key !== requestKey) return;

			let nextSermons: Sermon[] = [];
			let nextSermonTotal = 0;
			if (sermonRes) {
				if (!sermonRes.ok) throw new Error($t('predications.loadFailed'));
				const r = await sermonRes.json();
				nextSermons = (r.data || []) as Sermon[];
				nextSermonTotal = (r.total || 0) as number;
			}

			let nextRecordings: PublishedRecording[] = [];
			let nextRecordingsTotal = 0;
			if (retransmissionRes) {
				if (!retransmissionRes.ok) throw new Error($t('predications.loadRetransmissionsFailed'));
				const r = await retransmissionRes.json();
				nextRecordings = (r.data || []) as PublishedRecording[];
				nextRecordingsTotal = (r.total || 0) as number;
			}

			let nextYears = getCachedYears() || years;
			if (yearsRes) {
				if (yearsRes.ok) {
					const r = await yearsRes.json();
					nextYears = setCachedYears((r.data || []) as string[]);
				}
			}

			let nextAuthors = getCachedAuthors() || availableAuthors;
			if (authorsRes) {
				if (authorsRes.ok) {
					const r = await authorsRes.json();
					nextAuthors = setCachedAuthors((r.data || []) as string[]);
				}
			}

			const cached = setPredicationsPageCache(key, {
				filterType: isRetransmissions ? 'retransmission' : 'sermon',
				sermons: nextSermons,
				recordings: nextRecordings,
				recordingsTotal: nextRecordingsTotal,
				showBlendedRetransmissions: isBlendedSearch,
				total: isRetransmissions ? nextRecordingsTotal : nextSermonTotal,
				availableAuthors: nextAuthors,
				years: nextYears
			});

			applyData(cached);
			listLoadError = '';
		} catch (error) {
			if ((error as Error).name === 'AbortError') return;
			if (token !== currentRequestToken || key !== requestKey) return;
			listLoadError =
				error instanceof Error ? error.message : $t('predications.loadFailed');
			if (!hasResolvedList) {
				sermons = [];
				recordings = [];
				totalSermons = 0;
			}
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

			const cachedAuthors = getCachedAuthors() || [];
			const cachedYears = getCachedYears() || [];
			const cachedEntry = getPredicationsPageCache(requestKey);

			if (!isDeferredData) {
				const nextAuthors = initialAuthors.length > 0 ? initialAuthors : cachedAuthors;
				const nextYears = initialYears.length > 0 ? initialYears : cachedYears;
				const seeded = setPredicationsPageCache(requestKey, {
					filterType: initialFilterType,
					sermons: initialSermons,
					recordings: initialRecordings,
					recordingsTotal: initialRecordingsTotal,
					showBlendedRetransmissions: initialShowBlended,
					total: initialTotal,
					availableAuthors: nextAuthors,
					years: nextYears
				});
				if (nextAuthors.length > 0) setCachedAuthors(nextAuthors, seeded.fetchedAt);
				if (nextYears.length > 0) setCachedYears(nextYears, seeded.fetchedAt);
				abortRequest();
				applyData(seeded);
				isListLoading = false;
			} else if (cachedEntry) {
				applyData({
					...cachedEntry,
					availableAuthors:
						cachedEntry.availableAuthors.length > 0 ? cachedEntry.availableAuthors : cachedAuthors,
					years: cachedEntry.years.length > 0 ? cachedEntry.years : cachedYears
				});
				void loadInBackground({ showLoading: !isPredicationsPageCacheFresh(cachedEntry) });
			} else {
				abortRequest();
				sermons = [];
				recordings = [];
				recordingsTotal = 0;
				totalSermons = 0;
				availableAuthors = cachedAuthors;
				years = cachedYears;
				hasResolvedList = false;
				void loadInBackground({ showLoading: true });
			}
		}
	});

	onDestroy(() => abortRequest());

	$effect(() => {
		if (playlistSermons.length > 0) {
			basePlaylist.set(playlistSermons);
			if (!$isShuffle) playlist.set(playlistSermons);
		}
	});

	function handleAuthorChange(author: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (author === 'Tous') params.delete('author');
		else params.set('author', author);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleAlphaChange(letter: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentAlpha === letter) params.delete('alpha');
		else params.set('alpha', letter);
		params.delete('search');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleYearChange(year: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentYear === year) params.delete('year');
		else params.set('year', year);
		params.delete('search');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleAudioFilterToggle() {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentHasAudio) params.delete('hasAudio');
		else params.set('hasAudio', 'true');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleLanguageChange(lang: string) {
		if (currentLanguage === lang) return;
		const params = new URLSearchParams($page.url.searchParams);
		params.set('language', lang);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleSortChange(property: string) {
		const params = new URLSearchParams($page.url.searchParams);
		const current = params.get('sort') || 'iso_date:desc';
		const [currentProp, currentOrder] = current.split(':');

		let nextOrder = 'desc';
		if (currentProp === property) {
			nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
		} else {
			nextOrder = property === 'french_title' || property === 'author' ? 'asc' : 'desc';
		}

		params.set('sort', `${property}:${nextOrder}`);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}
</script>

<svelte:head>
	<title>Prédications - Missionnaire Network</title>
	<meta
		name="description"
		content="Explorez les prédications du Message par auteur, année, langue et thème. Lecture audio et recherche rapide sur Missionnaire Network."
	/>
	<meta property="og:title" content="Prédications - Missionnaire Network" />
	<meta
		property="og:description"
		content="Consultez les prédications de William Branham, Ewald Frank et de l'église locale."
	/>
	<link rel="canonical" href="https://missionnaire.net/predications" />
</svelte:head>

<div class="w-full max-w-6xl mx-auto px-4 pt-0 pb-8 md:px-6">
	<!-- Page Header -->
	<div class="mb-5 md:mb-6">
		<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
			{$t('nav.predications')}
		</p>
		<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">
			{$t('nav.predications')}
		</h1>
		<a
			href="/videos"
			class="inline-flex items-center gap-2 mt-2 text-[12px] font-semibold text-stone-400 hover:text-missionnaire uppercase tracking-[0.15em] font-body transition-colors"
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
				><polygon points="23 7 16 12 23 17 23 7" /><rect
					x="1"
					y="5"
					width="15"
					height="14"
					rx="2"
					ry="2"
				/></svg
			>
			{$t('predications.watchVideo')} →
		</a>
	</div>

	<!-- Content-type tabs: classic sermons vs recorded live broadcasts.
	     "Retransmissions" used to hide as a pseudo-author chip; non-technical
	     visitors never found it. -->
	<div class="flex items-center gap-0 mb-6 border-b border-stone-200/60" role="tablist" aria-label={$t('predications.contentType')}>
		<button
			role="tab"
			aria-selected={currentAuthor !== 'Retransmissions'}
			class="px-4 md:px-6 py-3 min-h-11 text-[12px] md:text-[13px] font-bold uppercase tracking-[0.15em] font-body border-b-2 -mb-px transition-colors {currentAuthor !== 'Retransmissions'
				? 'border-missionnaire text-missionnaire'
				: 'border-transparent text-stone-400 hover:text-stone-600'}"
			onclick={() => handleAuthorChange('Tous')}
		>
			{$t('misc.sermonBadge')}s
		</button>
		<button
			role="tab"
			aria-selected={currentAuthor === 'Retransmissions'}
			class="px-4 md:px-6 py-3 min-h-11 text-[12px] md:text-[13px] font-bold uppercase tracking-[0.15em] font-body border-b-2 -mb-px transition-colors {currentAuthor === 'Retransmissions'
				? 'border-missionnaire text-missionnaire'
				: 'border-transparent text-stone-400 hover:text-stone-600'}"
			onclick={() => handleAuthorChange('Retransmissions')}
		>
			{$t('misc.retransmissionBadge')}s
		</button>
	</div>

	<!-- Top Filters (Alpha & Authors) -->
	<div class="flex flex-col gap-6 mb-6 md:mb-8 {$mobileFiltersOpen ? '' : 'hidden md:flex'}">
		{#if !blendedOnly}
			<div>
				<h2
					class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-2 md:mb-3 text-center md:text-left font-body"
				>
					{$t('predications.alphabetical')}
				</h2>
				<div
					class="-mx-4 px-4 flex flex-nowrap overflow-x-auto no-scrollbar gap-x-3 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible md:gap-x-4 md:gap-y-2"
				>
					{#each alphabet as letter}
						<button
							class="shrink-0 px-1.5 py-2 md:py-0 text-xs md:text-[11px] font-body font-bold transition-all {currentAlpha === letter
								? 'text-missionnaire font-semibold'
								: 'text-stone-400 hover:text-missionnaire'}"
							onclick={() => handleAlphaChange(letter)}
						>
							{letter}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div>
			<h2
				class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-2 md:mb-3 text-center md:text-left font-body"
			>
				{$t('predications.preachers')}
			</h2>
			<div
				class="flex flex-wrap justify-center gap-2 pb-2 md:flex-nowrap md:overflow-x-auto md:gap-3 md:justify-start no-scrollbar"
			>
				{#each authors as author}
					<button
						class="flex-shrink-0 px-3 py-2 md:px-5 md:py-2.5 text-[10px] md:text-[11px] font-bold uppercase tracking-wider transition-all border {(author ===
							'Tous' &&
							!currentAuthor) ||
						currentAuthor === author
							? 'border-missionnaire text-missionnaire bg-missionnaire/10'
							: 'bg-white/40 text-stone-500 border-stone-200/60 hover:border-missionnaire hover:text-missionnaire'}"
						onclick={() => handleAuthorChange(author)}
					>
						{author === 'Tous' ? $t('misc.seeAllCap') : author}
					</button>
				{/each}
			</div>
		</div>

		{#if currentAuthor !== 'Retransmissions' && !blendedOnly}
			<div>
				<h2
					class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-2 md:mb-3 text-center md:text-left font-body"
				>
					{$t('misc.options')}
				</h2>
				<div
					class="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/40 p-4 border border-stone-200/60"
				>
					<div class="flex items-center gap-4 w-full md:w-auto">
						<div class="flex bg-stone-100 rounded-lg p-1">
							<button
								class="px-3 py-1.5 rounded-md text-xs font-bold transition-all {currentLanguage ===
								'french'
									? 'bg-white text-missionnaire shadow-sm'
									: 'text-stone-500 hover:text-stone-700'}"
								onclick={() => handleLanguageChange('french')}
							>
								{$t('lang.french')}
							</button>
							<button
								class="px-3 py-1.5 rounded-md text-xs font-bold transition-all {currentLanguage ===
								'english'
									? 'bg-white text-missionnaire shadow-sm'
									: 'text-stone-500 hover:text-stone-700'}"
								onclick={() => handleLanguageChange('english')}
							>
								{$t('lang.english')}
							</button>
						</div>

						<div class="h-6 w-px bg-stone-200"></div>

						<button
							class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all {currentHasAudio
								? 'bg-stone-100 text-missionnaire border border-stone-300'
								: 'bg-stone-50 text-stone-500 border border-transparent hover:bg-stone-100'}"
							onclick={() => handleAudioFilterToggle()}
						>
							<Icon src={IoPlayCircle} size="16" />
							{$t('predications.audioOnly')}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="flex flex-col md:flex-row gap-8">
		{#if (sermons.length > 0 || (isListLoading && !hasResolvedList)) && years.length > 0}
			<aside class="w-full md:w-56 flex-shrink-0 {$mobileFiltersOpen ? '' : 'hidden md:block'}">
				<div class="bg-white/40 border border-stone-200/60 p-5 md:sticky md:top-24">
					<h2
						class="text-xs font-bold text-stone-800 uppercase tracking-widest mb-6 pb-2 border-b border-stone-200/60 font-body"
					>
						{$t('predications.years')}
					</h2>
					<div class="grid grid-cols-3 gap-2 max-h-[70vh] overflow-y-auto no-scrollbar pr-1">
						{#each years as year}
							<button
								class="px-3 py-2 rounded-lg text-[11px] font-bold transition-all border text-center {currentYear ===
								year
									? 'border-missionnaire text-missionnaire bg-missionnaire/10'
									: 'bg-white/40 text-stone-400 border-stone-200/60 hover:border-missionnaire hover:text-missionnaire'}"
								onclick={() => handleYearChange(year)}
							>
								{year}
							</button>
						{/each}
					</div>
				</div>
			</aside>
		{/if}

		<div class="flex-1 min-w-0 relative">
			{#if currentSearch || currentAlpha || currentYear || currentHasAudio || (currentAuthor && currentAuthor !== 'Tous')}
				<div class="mb-3 flex justify-end">
					<button
						class="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-[10px] font-bold text-missionnaire hover:bg-stone-200 transition-colors"
						onclick={() => goto('?')}
						title={$t('list.resetFilters')}
					>
						<Icon src={BsX} size="14" />
						{$t('list.reset')}
					</button>
				</div>
			{/if}
			{#if !blendedOnly}
				{#if hasResolvedList}
					<div class="mb-2">
						<ResultsSummary
							from={summaryFrom}
							to={summaryTo}
							total={totalSermons}
							query={currentSearch}
						/>
					</div>
				{/if}
				<div class="bg-white/40 border border-stone-200/60 min-h-[500px] flex flex-col">
					<div
						class="relative grid grid-cols-[30px_1fr_auto_auto] {desktopSermonGrid} gap-2 md:gap-4 px-4 py-3 border-b border-stone-200/60 text-[10px] md:text-[11px] font-bold text-stone-400 uppercase tracking-widest bg-white/40 items-center"
					>
						<div class="text-center">#</div>
						<button
							class="text-left flex items-center gap-1.5 hover:text-missionnaire transition-colors"
							onclick={() => handleSortChange('french_title')}
						>
							{#if currentSort.startsWith('french_title')}
								<span class="text-missionnaire">
									<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
								</span>
							{/if}
							{$t('list.title')}
						</button>
						<button
							class="hidden md:flex text-left items-center gap-1.5 hover:text-missionnaire transition-colors"
							onclick={() => handleSortChange('author')}
						>
							{#if currentSort.startsWith('author')}
								<span class="text-missionnaire">
									<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
								</span>
							{/if}
							{$t('predications.preacher')}
						</button>
						<button
							class="hidden md:flex text-left items-center gap-1.5 hover:text-missionnaire transition-colors"
							onclick={() => handleSortChange('iso_date')}
						>
							{#if currentSort.startsWith('iso_date')}
								<span class="text-missionnaire">
									<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
								</span>
							{/if}
							{$t('list.date')}
						</button>
						<button
							class="hidden md:flex text-center items-center justify-center gap-1.5 hover:text-missionnaire transition-colors"
							onclick={() => handleSortChange('duration')}
						>
							{#if currentSort.startsWith('duration')}
								<span class="text-missionnaire">
									<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
								</span>
							{/if}
							{$t('list.duration')}
						</button>
						<div class="flex items-center justify-center text-center">
							<span class="hidden md:inline">{$t('list.actions')}</span>
						</div>
					</div>

					<div class="divide-y divide-stone-100 [&>*]:hover:bg-white/60">
						{#if isListLoading && !hasResolvedList}
							<ListSkeleton rows={8} />
						{:else if listLoadError && !hasResolvedList}
							<ErrorCard
								message={listLoadError}
								onRetry={() => void loadInBackground({ showLoading: true })}
							/>
						{:else}
							{#if isListLoading}
								<div
									class="border-b border-stone-200/60 bg-stone-50/70 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400"
								>
									{$t('list.updating')}
								</div>
							{/if}
							{#if filterType === 'retransmission'}
								{#each recordings as recording, i (recording.id)}
									<RetransmissionTableItem
										{recording}
										absoluteIndex={i + 1 + (currentPage - 1) * limit}
									/>
								{:else}
									<div class="py-24 text-center">
										<div
											class="bg-stone-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-200"
										>
											<Icon src={BsSearch} size="32" />
										</div>
										<h3 class="text-xl font-bold text-stone-800 mb-2">
											{$t('predications.noRetransmissions')}
										</h3>
										<p class="text-stone-400 text-sm">
											{$t('list.tryAdjustFilters')}
										</p>
									</div>
								{/each}
							{:else}
								{#each sermons as sermon, i (sermon._id)}
									<SermonTableItem
										{sermon}
										index={i}
										absoluteIndex={i + 1 + (currentPage - 1) * limit}
										language={currentLanguage}
									/>
								{:else}
									<div class="py-24 text-center">
										<div
											class="bg-stone-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-200"
										>
											<Icon src={BsSearch} size="32" />
										</div>
										<h3 class="text-xl font-bold text-stone-800 mb-2">
											{$t('predications.noSermons')}
										</h3>
										<p class="text-stone-400 text-sm">
											{$t('list.tryAdjustFilters')}
										</p>
									</div>
								{/each}
							{/if}
						{/if}
					</div>
				</div>
			{/if}

			{#if hasResolvedList && totalPages > 1}
				<div class="mt-12 py-6 border-t border-stone-200/60 flex flex-col gap-6">
					<div
						class="flex flex-col sm:flex-row items-center sm:justify-between gap-4 text-[10px] md:text-xs font-bold text-stone-400 tracking-widest uppercase"
					>
						<div class="hidden md:block">
							{$t('predications.showingOf', { shown: sermons.length, total: totalSermons })}
						</div>
						<div class="flex items-center gap-3">
							<span class="opacity-60">{$t('list.rows')}</span>
							<select
								class="bg-stone-100 rounded-lg px-3 py-1.5 outline-none text-stone-800 focus:ring-2 focus:ring-missionnaire/20 transition-all cursor-pointer"
								value={limit}
								onchange={(e) => {
									const params = new URLSearchParams($page.url.searchParams);
									params.set('limit', e.currentTarget.value);
									params.set('page', '1');
									goto(`?${params.toString()}`);
								}}
							>
								<option value="10">10</option>
								<option value="20">20</option>
								<option value="50">50</option>
								<option value="100">100</option>
							</select>
						</div>
					</div>
					<Pagination
						current={currentPage}
						total={totalPages}
						getHref={(p) => {
							const params = new URLSearchParams($page.url.searchParams);
							params.set('page', String(p));
							return `?${params.toString()}`;
						}}
					/>
				</div>
			{/if}

			{#if showBlendedRetransmissions && recordings.length > 0}
				<section class="mt-12">
					<div class="mb-4 flex items-baseline justify-between gap-4">
						<h2
							class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] font-body"
						>
							{$t('predications.retransmissionsMatching', { query: currentSearch })}
							<span class="ml-2 normal-case tracking-normal text-stone-400 font-normal"
								>{recordingsTotal ?? recordings.length}</span
							>
						</h2>
						{#if (recordingsTotal ?? 0) > recordings.length}
							<a
								href={(() => {
									const p = new URLSearchParams($page.url.searchParams);
									p.set('author', 'Retransmissions');
									p.set('page', '1');
									return `?${p.toString()}`;
								})()}
								class="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.15em] text-missionnaire hover:underline"
							>
								{$t('misc.viewAll')} →
							</a>
						{/if}
					</div>
					<div class="divide-y divide-stone-100 border border-stone-200/60 bg-white/40">
						{#each recordings as recording, i (recording.id)}
							<RetransmissionTableItem {recording} absoluteIndex={i + 1} showBadge />
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</div>
</div>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
