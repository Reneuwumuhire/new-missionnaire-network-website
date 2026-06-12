<script lang="ts">
	import { t } from '../../i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { Sermon } from '$lib/models/sermon';
	import type { PublishedRecording } from '$lib/server/recordings';
	import { basePlaylist, playlist, isShuffle } from '$lib/stores/global';
	import { portal } from '$lib/actions/portal';
	import { focusTrap } from '$lib/actions/focusTrap';
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
	import { onDestroy, onMount, tick, untrack } from 'svelte';
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

	// "Filtres" sheet — bottom sheet on mobile, centered dialog on sm+
	// (same pattern as /musique). Hosts the alphabet, years, language and
	// audio-only filters; every choice routes through the existing
	// handle*Change URL handlers, so filters behave exactly as before.
	let filtersOpen = $state(false);

	function openFilters() {
		filtersOpen = true;
	}

	function closeFilters() {
		filtersOpen = false;
	}

	// Badge on the "Filtres" button: how many sheet-managed filters are
	// currently narrowing the list (the preacher has its own pill row).
	let activeFilterCount = $derived(
		(currentAlpha ? 1 : 0) +
			(currentYear ? 1 : 0) +
			(currentLanguage === 'english' ? 1 : 0) +
			(currentHasAudio ? 1 : 0)
	);

	// Preacher pill row scroll affordance (edge fade), mirroring the
	// Recueils row on /musique.
	let pillsScrollEl: HTMLDivElement | undefined = $state();
	let pillsCanLeft = $state(false);
	let pillsCanRight = $state(true);

	function updatePillsScrollState() {
		if (!pillsScrollEl) return;
		const { scrollLeft, clientWidth, scrollWidth } = pillsScrollEl;
		pillsCanLeft = scrollLeft > 4;
		pillsCanRight = scrollLeft + clientWidth < scrollWidth - 4;
	}

	onMount(() => {
		updatePillsScrollState();
	});

	// Authors arrive async on cold loads — recompute the edge fade once
	// the pill row has re-rendered with the full list.
	$effect(() => {
		void authors.length;
		void tick().then(updatePillsScrollState);
	});

	// Debounced list search for the utility bar (mobile only; desktop keeps
	// the header band's inline search). Same 300ms debounce and URL params
	// as the layout's hero search, so both inputs stay in sync via the URL.
	let searchInput = $state(((data as any).search || '') as string);
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSyncedListSearch = $state(((data as any).search || '') as string);

	function applyListSearch() {
		const params = new URLSearchParams($page.url.searchParams);
		const value = (searchInput || '').trim();
		if (value) params.set('search', value);
		else params.delete('search');
		params.delete('alpha');
		params.delete('year');
		params.set('page', '1');
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function onSearchInput() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			if ((searchInput || '').trim() !== (currentSearch || '')) applyListSearch();
		}, 300);
	}

	function clearListSearch() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchInput = '';
		if (currentSearch) applyListSearch();
	}

	// Keep the utility-bar search in step with the URL (e.g. when the
	// desktop band search or a back/forward navigation changes it),
	// without stomping on in-progress typing.
	$effect(() => {
		const urlSearch = currentSearch || '';
		if (urlSearch !== lastSyncedListSearch) {
			searchInput = urlSearch;
			untrack(() => {
				lastSyncedListSearch = urlSearch;
			});
		}
	});

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

	onDestroy(() => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		abortRequest();
	});

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

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->

<div class="w-full max-w-6xl mx-auto px-4 pt-0 pb-8 md:px-6">
	<!-- Content-type tabs: classic sermons vs recorded live broadcasts.
	     Page identity now lives in the layout's compact band; the video
	     cross-link sits beside the tabs instead of a second header. -->
	<div class="mb-4 md:mb-5 flex items-center justify-between gap-3 border-b border-stone-200/60">
		<div class="flex items-center gap-0" role="tablist" aria-label={$t('predications.contentType')}>
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
		<a
			href="/videos"
			class="inline-flex shrink-0 items-center gap-2 text-[10px] md:text-[11px] font-semibold text-stone-400 hover:text-missionnaire uppercase tracking-[0.15em] font-body transition-all duration-200 hover:translate-x-0.5"
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

	<!-- ROW 1 — Preachers: THE primary filter, music-app style pill row
	     directly under the tabs (mirrors the Recueils row on /musique).
	     The active pill is solid missionnaire orange; edge fade hints at
	     horizontal scrollability. -->
	<div
		class="preachers-scroll relative -mx-4 md:mx-0"
		class:can-scroll-left={pillsCanLeft}
		class:can-scroll-right={pillsCanRight}
	>
		<div
			bind:this={pillsScrollEl}
			onscroll={updatePillsScrollState}
			class="preachers-track flex overflow-x-auto overscroll-x-contain gap-2 md:gap-2.5 no-scrollbar px-4 md:px-0 py-1"
			style="scrollbar-width: none; -ms-overflow-style: none;"
			role="group"
			aria-label={$t('predications.preachers')}
		>
			{#each authors as author}
				{@const isActivePill =
					(author === 'Tous' && !currentAuthor) || currentAuthor === author}
				<button
					class="flex-shrink-0 inline-flex items-center h-10 md:h-11 px-4 md:px-5 rounded-full border text-[11px] md:text-xs font-bold uppercase tracking-[0.1em] md:tracking-wider transition-colors duration-150 {isActivePill
						? 'bg-missionnaire border-missionnaire text-white shadow-sm'
						: 'bg-white/60 text-stone-600 border-stone-200 hover:border-missionnaire hover:text-missionnaire'}"
					aria-pressed={isActivePill}
					onclick={() => handleAuthorChange(author)}
				>
					{author === 'Tous' ? $t('misc.seeAllCap') : author}
				</button>
			{/each}
		</div>
	</div>

	<!-- ROW 2 — slim utility bar: compact search (mobile only; desktop
	     keeps the header band's inline search) + one "Filtres" button that
	     opens the sheet (alphabet, years, language, audio-only). -->
	<div class="mt-3 mb-3 md:mb-4 flex items-center gap-2 md:justify-end">
		<div class="relative min-w-0 flex-1 md:hidden">
			<svg
				class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
				width="14"
				height="14"
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
			<input
				type="text"
				inputmode="search"
				enterkeyhint="search"
				autocomplete="off"
				class="h-10 w-full border border-stone-200 bg-white/70 pl-9 {searchInput
					? 'pr-9'
					: 'pr-3'} font-body text-sm text-stone-800 outline-none transition-colors duration-150 placeholder:text-stone-400 focus:border-missionnaire/60 focus:bg-white"
				placeholder={$t('predications.searchPlaceholder')}
				aria-label={$t('predications.searchPlaceholder')}
				bind:value={searchInput}
				oninput={onSearchInput}
			/>
			{#if searchInput}
				<button
					type="button"
					class="absolute right-0 top-0 flex h-10 w-9 items-center justify-center text-stone-400 transition-colors duration-150 hover:text-stone-700"
					aria-label={$t('predications.clearSearch')}
					onclick={clearListSearch}
				>
					<Icon src={BsX} size="16" />
				</button>
			{/if}
		</div>
		<button
			class="inline-flex h-10 shrink-0 items-center gap-2 border px-4 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors duration-150 {filtersOpen ||
			activeFilterCount > 0
				? 'border-missionnaire/60 bg-missionnaire/5 text-missionnaire'
				: 'border-stone-200 bg-white/70 text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
			aria-haspopup="dialog"
			aria-expanded={filtersOpen}
			onclick={openFilters}
		>
			<svg
				viewBox="0 0 24 24"
				width="13"
				height="13"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<line x1="4" y1="6" x2="20" y2="6" />
				<line x1="7" y1="12" x2="17" y2="12" />
				<line x1="10" y1="18" x2="14" y2="18" />
			</svg>
			{$t('predications.filters')}
			{#if activeFilterCount > 0}
				<span
					class="flex h-4 min-w-4 items-center justify-center rounded-full bg-missionnaire px-1 text-[9px] font-bold text-white"
				>
					{activeFilterCount}
				</span>
			{/if}
		</button>
	</div>

	<!-- Active sheet-filters as dismissible chips (the preacher state is
	     already visible in the pill row above). -->
	{#if currentAlpha || currentYear || currentLanguage === 'english' || currentHasAudio}
		<div class="mb-3 flex flex-wrap gap-2">
			{#if currentAlpha}
				<button
					class="flex items-center gap-1.5 rounded-full border border-missionnaire/40 bg-missionnaire/10 px-3 py-1.5 text-xs font-semibold text-missionnaire"
					onclick={() => handleAlphaChange(currentAlpha)}
				>
					<span>{$t('predications.letterLabel', { letter: currentAlpha })}</span>
					<Icon src={BsX} size="14" />
				</button>
			{/if}
			{#if currentYear}
				<button
					class="flex items-center gap-1.5 rounded-full border border-missionnaire/40 bg-missionnaire/10 px-3 py-1.5 text-xs font-semibold text-missionnaire"
					onclick={() => handleYearChange(currentYear)}
				>
					<span>{$t('predications.yearLabel', { year: currentYear })}</span>
					<Icon src={BsX} size="14" />
				</button>
			{/if}
			{#if currentLanguage === 'english'}
				<button
					class="flex items-center gap-1.5 rounded-full border border-missionnaire/40 bg-missionnaire/10 px-3 py-1.5 text-xs font-semibold text-missionnaire"
					onclick={() => handleLanguageChange('french')}
					title={$t('lang.french')}
				>
					<span>{$t('lang.english')}</span>
					<Icon src={BsX} size="14" />
				</button>
			{/if}
			{#if currentHasAudio}
				<button
					class="flex items-center gap-1.5 rounded-full border border-missionnaire/40 bg-missionnaire/10 px-3 py-1.5 text-xs font-semibold text-missionnaire"
					onclick={() => handleAudioFilterToggle()}
				>
					<span>{$t('predications.audioOnly')}</span>
					<Icon src={BsX} size="14" />
				</button>
			{/if}
		</div>
	{/if}

	<!-- The years sidebar moved into the Filtres sheet — the list now
	     takes the full width, like /musique. -->
	<div class="relative">
			{#if currentSearch || currentAlpha || currentYear || currentHasAudio || (currentAuthor && currentAuthor !== 'Tous')}
				<div class="mb-3 flex justify-end">
					<button
						class="inline-flex items-center gap-1.5 border border-stone-200 bg-white/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500 hover:border-missionnaire hover:text-missionnaire transition-colors duration-200 active:scale-[0.98]"
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
						class="flex flex-col sm:flex-row items-center sm:justify-between gap-4 text-[10px] md:text-xs font-bold text-stone-400 tracking-widest uppercase tabular-nums"
					>
						<div class="hidden md:block">
							{$t('predications.showingOf', { shown: sermons.length, total: totalSermons })}
						</div>
						<div class="flex items-center gap-3">
							<span class="opacity-60">{$t('list.rows')}</span>
							<select
								class="border border-stone-200 bg-white px-3 py-1.5 outline-none text-stone-800 tabular-nums focus:ring-2 focus:ring-missionnaire/20 transition-all cursor-pointer"
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
							class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.3em] font-body"
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

<!-- "Filtres" sheet — bottom sheet on mobile, centered panel on sm+.
     Hosts everything that used to crowd the rows above the list: the
     alphabet filter, the years grid (old sidebar), the language toggle
     and the audio-only toggle. Each choice routes through the existing
     handle*Change goto/URL handlers, so a filter picked here applies
     exactly like the old inline panels. Portalled to <body> because the
     layout wrapper's transform makes it a containing block for
     position: fixed. -->
{#if filtersOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		use:portal
		class="fixed inset-0 z-[100] flex items-end justify-center bg-stone-900/50 backdrop-blur-sm sm:items-center sm:p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeFilters();
		}}
	>
		<div
			class="filters-sheet flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden border border-stone-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={$t('predications.filters')}
			use:focusTrap={{ onEscape: closeFilters }}
		>
			<div class="flex items-center justify-between border-b border-stone-100 px-5 py-4">
				<p class="text-[10px] font-bold uppercase tracking-[0.25em] text-missionnaire">
					{$t('predications.filters')}
				</p>
				<button
					class="p-1 text-stone-400 transition-colors duration-150 hover:text-stone-700"
					onclick={closeFilters}
					aria-label={$t('misc.close')}
				>
					<Icon src={BsX} size="20" />
				</button>
			</div>

			<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
				<!-- Alphabet -->
				{#if !blendedOnly}
					<section>
						<h3 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
							{$t('predications.alphabetical')}
						</h3>
						<div class="grid grid-cols-7 gap-1.5">
							{#each alphabet as letter}
								<button
									class="flex h-9 items-center justify-center border text-xs font-bold transition-colors duration-150 {currentAlpha ===
									letter
										? 'bg-missionnaire border-missionnaire text-white'
										: 'border-stone-200 bg-white text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
									aria-pressed={currentAlpha === letter}
									onclick={() => {
										handleAlphaChange(letter);
										closeFilters();
									}}
								>
									{letter}
								</button>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Years (old sidebar) -->
				{#if years.length > 0}
					<section>
						<h3 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
							{$t('predications.years')}
						</h3>
						<div class="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
							{#each years as year}
								<button
									class="flex h-9 items-center justify-center border text-xs font-bold tabular-nums transition-colors duration-150 {currentYear ===
									year
										? 'bg-missionnaire border-missionnaire text-white'
										: 'border-stone-200 bg-white text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
									aria-pressed={currentYear === year}
									onclick={() => {
										handleYearChange(year);
										closeFilters();
									}}
								>
									{year}
								</button>
							{/each}
						</div>
					</section>
				{/if}

				{#if currentAuthor !== 'Retransmissions' && !blendedOnly}
					<!-- Language -->
					<section>
						<h3 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
							{$t('lang.label')}
						</h3>
						<div class="flex flex-wrap gap-2">
							<button
								class="inline-flex h-9 items-center rounded-full border px-3.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-150 {currentLanguage ===
								'french'
									? 'bg-missionnaire border-missionnaire text-white'
									: 'border-stone-200 bg-white text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
								aria-pressed={currentLanguage === 'french'}
								onclick={() => handleLanguageChange('french')}
							>
								{$t('lang.french')}
							</button>
							<button
								class="inline-flex h-9 items-center rounded-full border px-3.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-150 {currentLanguage ===
								'english'
									? 'bg-missionnaire border-missionnaire text-white'
									: 'border-stone-200 bg-white text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
								aria-pressed={currentLanguage === 'english'}
								onclick={() => handleLanguageChange('english')}
							>
								{$t('lang.english')}
							</button>
						</div>
					</section>

					<!-- Audio only -->
					<section>
						<h3 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
							{$t('misc.options')}
						</h3>
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-150 {currentHasAudio
								? 'bg-missionnaire border-missionnaire text-white'
								: 'border-stone-200 bg-white text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
							aria-pressed={!!currentHasAudio}
							onclick={() => handleAudioFilterToggle()}
						>
							<Icon src={IoPlayCircle} size="14" />
							{$t('predications.audioOnly')}
						</button>
					</section>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	/* Filtres sheet entrance: quick slide-up from the bottom edge on
	   mobile (where it is a bottom sheet). Kept under 200ms and disabled
	   entirely for prefers-reduced-motion. Same as /musique. */
	.filters-sheet {
		animation: sheet-up 0.18s ease-out;
	}

	@keyframes sheet-up {
		from {
			transform: translateY(24px);
			opacity: 0.5;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.filters-sheet {
			animation: none;
		}
	}

	/* Edge-fade affordance for the horizontally scrollable Prédicateurs
	   row — same treatment as the Recueils row on /musique. */
	.preachers-scroll .preachers-track {
		--fade: 28px;
		-webkit-mask-image: linear-gradient(to right, #000 0, #000 100%);
		mask-image: linear-gradient(to right, #000 0, #000 100%);
	}
	.preachers-scroll.can-scroll-right .preachers-track {
		-webkit-mask-image: linear-gradient(
			to right,
			#000 0,
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
		mask-image: linear-gradient(to right, #000 0, #000 calc(100% - var(--fade)), transparent 100%);
	}
	.preachers-scroll.can-scroll-left .preachers-track {
		-webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--fade), #000 100%);
		mask-image: linear-gradient(to right, transparent 0, #000 var(--fade), #000 100%);
	}
	.preachers-scroll.can-scroll-left.can-scroll-right .preachers-track {
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
		mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
	}
</style>
