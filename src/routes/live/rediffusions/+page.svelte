<script lang="ts">
	import type { PageData } from './$types';
	import type { PublishedRecording } from '$lib/server/recordings';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { vercelImage, vercelImageSrcSet, vercelImagePlaceholder } from '$lib/utils/vercelImage';
	import BlurUpImage from '$lib/components/BlurUpImage.svelte';
	// @ts-ignore — svelte-icons-pack has no types
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoReload from 'svelte-icons-pack/io/IoReload';

	export let data: PageData;

	$: totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

	// ── Filter state ───────────────────────────────────────────────
	// Local copies of the URL-backed filters so the inputs feel responsive.
	// Submitting (or debounced search) calls `applyFilters` which updates
	// the URL and triggers a server reload.
	let searchInput = data.filters.q;
	let yearInput: number | '' = data.filters.year ?? '';
	let monthInput: number | '' = data.filters.month ?? '';

	// Re-sync when SvelteKit reloads with new data (e.g. back/forward nav).
	$: searchInput = data.filters.q;
	$: yearInput = data.filters.year ?? '';
	$: monthInput = data.filters.month ?? '';

	const MONTHS: Array<{ value: number; label: string }> = [
		{ value: 1, label: 'Janvier' },
		{ value: 2, label: 'Février' },
		{ value: 3, label: 'Mars' },
		{ value: 4, label: 'Avril' },
		{ value: 5, label: 'Mai' },
		{ value: 6, label: 'Juin' },
		{ value: 7, label: 'Juillet' },
		{ value: 8, label: 'Août' },
		{ value: 9, label: 'Septembre' },
		{ value: 10, label: 'Octobre' },
		{ value: 11, label: 'Novembre' },
		{ value: 12, label: 'Décembre' }
	];

	function buildQuery(overrides: Partial<{ page: number; q: string; year: number | ''; month: number | '' }>): string {
		const q = overrides.q !== undefined ? overrides.q : data.filters.q;
		const year = overrides.year !== undefined ? overrides.year : (data.filters.year ?? '');
		const month = overrides.month !== undefined ? overrides.month : (data.filters.month ?? '');
		const pageN = overrides.page !== undefined ? overrides.page : data.pageNumber;

		const params = new URLSearchParams();
		if (pageN > 1) params.set('page', String(pageN));
		if (q) params.set('q', q);
		if (year) params.set('year', String(year));
		if (year && month) params.set('month', String(month));
		const qs = params.toString();
		return qs ? `?${qs}` : '';
	}

	function listHref(pageN: number): string {
		return `/live/rediffusions${buildQuery({ page: pageN })}`;
	}

	// Link to a recording, carrying the current list state so the detail
	// page can rebuild the exact same "Tous les directs" URL.
	function detailHref(id: string): string {
		const current = buildQuery({}).replace(/^\?/, '');
		const suffix = current ? `?from=${encodeURIComponent(current)}` : '';
		return `/live/rediffusions/${id}${suffix}`;
	}

	// Debounced search: 350ms after the last keystroke, push the new URL.
	// `replaceState: true` on search keeps browser history clean — typing
	// shouldn't bury the previous page under 12 history entries.
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	function onSearchInput() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const target = `/live/rediffusions${buildQuery({ q: searchInput, page: 1 })}`;
			goto(target, { keepFocus: true, replaceState: true, noScroll: true });
		}, 350);
	}

	function onFilterChange() {
		// Year cleared → month must clear too (a month without a year is ambiguous).
		const year = yearInput === '' ? '' : Number(yearInput);
		const month = year === '' ? '' : monthInput === '' ? '' : Number(monthInput);
		goto(`/live/rediffusions${buildQuery({ year, month, page: 1 })}`, {
			keepFocus: true,
			noScroll: true
		});
	}

	function resetFilters() {
		searchInput = '';
		yearInput = '';
		monthInput = '';
		goto('/live/rediffusions', { noScroll: true });
	}

	$: hasActiveFilters = Boolean(data.filters.q || data.filters.year);

	// ── Pagination shape ───────────────────────────────────────────
	// Produces [1, '…', 4, 5, 6, '…', 12] with the current page and its
	// neighbours always visible, plus the first and last.
	// Window of pages shown on each side of the current page, in addition to
	// the first and last anchors. `siblings = 2` renders e.g. `1 … 17 18 [19] 20 21`.
	const PAGINATION_SIBLINGS = 2;

	function buildPageList(current: number, total: number): Array<number | '…'> {
		// If the full list fits within what we'd otherwise render, just show it.
		const maxInline = PAGINATION_SIBLINGS * 2 + 5; // siblings on each side + first + last + current + 2 ellipses
		if (total <= maxInline) {
			return Array.from({ length: total }, (_, i) => i + 1);
		}
		const anchors = new Set<number>([1, total]);
		for (let offset = -PAGINATION_SIBLINGS; offset <= PAGINATION_SIBLINGS; offset++) {
			anchors.add(current + offset);
		}
		const sorted = [...anchors].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
		const result: Array<number | '…'> = [];
		for (let i = 0; i < sorted.length; i++) {
			if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
			result.push(sorted[i]);
		}
		return result;
	}

	$: pageList = buildPageList(data.pageNumber, totalPages);

	let expandedThumb: PublishedRecording | null = null;
	let failedThumbs = new Set<string>();
	function markThumbFailed(id: string | undefined) {
		if (!id || failedThumbs.has(id)) return;
		failedThumbs = new Set(failedThumbs).add(id);
	}

	function openThumb(rec: PublishedRecording, event: MouseEvent) {
		if (!rec.thumbnail_url || failedThumbs.has(rec.id)) return;
		event.preventDefault();
		event.stopPropagation();
		expandedThumb = rec;
	}

	function closeThumb() {
		expandedThumb = null;
	}

	function onLightboxKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeThumb();
	}

	function onLightboxBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeThumb();
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	function formatDuration(sec: number | null): string {
		if (!sec) return '—';
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`;
	}
</script>

<svelte:head>
	<title>Directs précédents - Missionnaire Network</title>
	<meta
		name="description"
		content="Réécoutez les directs audio précédents de Missionnaire Network."
	/>
	<link rel="canonical" href="https://missionnaire.net/live/rediffusions" />
</svelte:head>

<svelte:window on:keydown={onLightboxKeydown} />

<section class="w-full py-10 px-6">
	<div class="max-w-3xl mx-auto">
		<!-- Header -->
		<div class="text-center mb-12">
			<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
				Archives
			</p>
			<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">
				Directs précédents
			</h1>
			{#if data.allTotal > 0}
				<p class="mt-4 font-body text-stone-500 text-base">
					<span class="font-display text-missionnaire text-2xl md:text-3xl font-semibold align-middle tabular-nums">{data.allTotal}</span>
					<span class="align-middle">enregistrement{data.allTotal > 1 ? 's' : ''} disponible{data.allTotal > 1 ? 's' : ''}</span>
				</p>
			{/if}
			<p
				class="mt-3 text-[15px] text-stone-400 font-body font-light max-w-md mx-auto leading-relaxed"
			>
				Retrouvez les enregistrements des directs audio passés.
			</p>
		</div>

		<!-- Back to live -->
		<div class="mb-6 text-center">
			<a
				href="/live"
				class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-missionnaire/80 hover:text-missionnaire transition-colors"
			>
				← Retour au direct
			</a>
		</div>

		<!-- Filters: search + year + month. Progressive-enhancement form so
		     it still submits on non-JS clients. -->
		<form
			method="GET"
			action="/live/rediffusions"
			on:submit|preventDefault={() => onSearchInput()}
			class="mb-6 border border-stone-200/60 bg-white/40 p-3 sm:p-4"
		>
			<div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
				<label class="relative flex-1">
					<span class="sr-only">Rechercher un titre</span>
					<svg
						aria-hidden="true"
						class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="m21 21-4.3-4.3" />
					</svg>
					<input
						type="search"
						name="q"
						placeholder="Rechercher un titre…"
						bind:value={searchInput}
						on:input={onSearchInput}
						class="w-full border border-stone-200/80 bg-white pl-9 pr-3 py-2 text-sm font-body text-stone-800 placeholder:text-stone-400 focus:border-missionnaire/40 focus:outline-none focus:ring-1 focus:ring-missionnaire/30"
					/>
				</label>

				<select
					name="year"
					bind:value={yearInput}
					on:change={onFilterChange}
					disabled={$navigating ? true : false}
					class="border border-stone-200/80 bg-white px-3 py-2 text-sm font-body text-stone-800 disabled:opacity-50 disabled:cursor-not-allowed focus:border-missionnaire/40 focus:outline-none focus:ring-1 focus:ring-missionnaire/30"
					aria-label="Filtrer par année"
				>
					<option value="">Toutes les années</option>
					{#each data.availableYears as year}
						<option value={year}>{year}</option>
					{/each}
				</select>

				<select
					name="month"
					bind:value={monthInput}
					on:change={onFilterChange}
					disabled={!yearInput || !!$navigating}
					class="border border-stone-200/80 bg-white px-3 py-2 text-sm font-body text-stone-800 disabled:opacity-50 disabled:cursor-not-allowed focus:border-missionnaire/40 focus:outline-none focus:ring-1 focus:ring-missionnaire/30"
					aria-label="Filtrer par mois"
				>
					<option value="">Tous les mois</option>
					{#each MONTHS as m}
						<option value={m.value}>{m.label}</option>
					{/each}
				</select>
			</div>

			{#if hasActiveFilters}
				<div class="mt-3 flex items-center justify-between text-[11px] font-body text-stone-500">
					<span>
						{data.total} résultat{data.total > 1 ? 's' : ''}
					</span>
					<button
						type="button"
						on:click={resetFilters}
						class="font-bold uppercase tracking-[0.15em] text-missionnaire/80 hover:text-missionnaire transition-colors"
					>
						Réinitialiser
					</button>
				</div>
			{/if}

			<!-- Non-JS fallback: a visible submit preserves the form for crawlers
			     and users without JS. Hidden visually but accessible. -->
			<noscript>
				<button type="submit" class="mt-3 w-full bg-missionnaire text-white py-2 text-sm">
					Appliquer
				</button>
			</noscript>
		</form>

		<!-- Results: overlay a spinner while SvelteKit is loading a new filter/page. -->
		<div class="relative min-h-[200px]">
			{#if $navigating}
				<div
					class="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex items-center justify-center transition-all duration-300"
				>
					<div class="flex flex-col items-center gap-4">
						<div class="text-missionnaire animate-spin">
							<Icon src={IoReload} size="32" />
						</div>
						<span
							class="text-[10px] font-semibold uppercase tracking-[0.25em] text-missionnaire animate-pulse"
							>Chargement...</span
						>
					</div>
				</div>
			{/if}

			{#if data.recordings.length === 0}
				<div class="text-center py-16">
					<p class="font-display text-lg italic text-stone-400">
						{hasActiveFilters
							? 'Aucun enregistrement ne correspond à votre recherche.'
							: 'Aucun enregistrement disponible pour le moment.'}
					</p>
				</div>
			{:else}
			<ul class="divide-y divide-stone-100 border border-stone-200/60 bg-white/40">
				{#each data.recordings as rec}
					<li>
						<div
							class="group relative flex items-center gap-4 px-4 py-4 transition-colors hover:bg-missionnaire/5"
						>
							<!-- Thumbnail — clickable to expand, separate from row nav -->
							<button
								type="button"
								on:click={(e) => openThumb(rec, e)}
								aria-label={rec.thumbnail_url ? 'Agrandir la vignette' : 'Vignette par défaut'}
								class="relative h-14 w-24 sm:h-16 sm:w-28 shrink-0 overflow-hidden border border-stone-200/60 bg-stone-100 {rec.thumbnail_url
									? 'cursor-zoom-in'
									: 'cursor-default'} focus:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
							>
								{#if rec.thumbnail_url && !failedThumbs.has(rec.id)}
									<BlurUpImage
										src={vercelImage(rec.thumbnail_url, 192)}
										srcset={vercelImageSrcSet(rec.thumbnail_url, 96)}
										placeholderSrc={vercelImagePlaceholder(rec.thumbnail_url)}
										alt=""
										width={96}
										height={54}
										loading="lazy"
										fetchpriority="low"
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										on:error={() => markThumbFailed(rec.id)}
									/>
								{:else}
									<div class="default-thumbnail absolute inset-0 flex items-center justify-center">
										<picture>
											<source srcset="/icons/logo.webp" type="image/webp" />
											<img
												src="/icons/logo.png"
												alt=""
												class="h-4 w-auto opacity-80"
												width="150"
												height="64"
												loading="lazy"
											/>
										</picture>
									</div>
								{/if}
							</button>

							<!-- Title + meta — row navigation -->
							<a
								href={detailHref(rec.id)}
								class="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40 rounded"
							>
								<p
									class="font-display text-[15px] sm:text-base font-medium text-stone-800 group-hover:text-missionnaire transition-colors leading-snug line-clamp-2"
								>
									{rec.title}
								</p>
								<p class="mt-1 text-xs text-stone-400 font-body">
									{formatDate(rec.started_at)} · {formatDuration(rec.duration_sec)}
								</p>
							</a>

							<!-- Listen affordance (desktop only) -->
							<a
								href={detailHref(rec.id)}
								aria-hidden="true"
								tabindex="-1"
								class="hidden sm:inline-flex shrink-0 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-stone-300 group-hover:text-missionnaire transition-colors"
							>
								Écouter →
							</a>
						</div>
					</li>
				{/each}
			</ul>

			{#if totalPages > 1}
				<nav class="mt-8 flex flex-wrap items-center justify-center gap-1 text-sm font-body" aria-label="Pagination">
					{#if data.pageNumber > 1}
						<a
							href={listHref(data.pageNumber - 1)}
							data-sveltekit-preload-data="hover"
						class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors"
							aria-label="Page précédente"
						>
							‹
						</a>
					{:else}
						<span
							class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-100 text-stone-300 cursor-not-allowed"
							aria-hidden="true"
						>
							‹
						</span>
					{/if}

					{#each pageList as item}
						{#if item === '…'}
							<span class="inline-flex items-center justify-center h-9 min-w-9 px-2 text-stone-400" aria-hidden="true">…</span>
						{:else if item === data.pageNumber}
							<span
								aria-current="page"
								class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-missionnaire bg-missionnaire text-white font-semibold tabular-nums"
							>
								{item}
							</span>
						{:else}
							<a
								href={listHref(item)}
								class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors tabular-nums"
								aria-label="Page {item}"
							>
								{item}
							</a>
						{/if}
					{/each}

					{#if data.pageNumber < totalPages}
						<a
							href={listHref(data.pageNumber + 1)}
							data-sveltekit-preload-data="hover"
						class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors"
							aria-label="Page suivante"
						>
							›
						</a>
					{:else}
						<span
							class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-100 text-stone-300 cursor-not-allowed"
							aria-hidden="true"
						>
							›
						</span>
					{/if}
				</nav>
			{/if}
		{/if}
		</div>
	</div>
</section>

{#if expandedThumb && expandedThumb.thumbnail_url && !failedThumbs.has(expandedThumb.id)}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-lightbox-in"
		on:click={onLightboxBackdropClick}
		on:keydown={onLightboxKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Vignette du direct"
		tabindex="-1"
	>
		<button
			type="button"
			on:click={closeThumb}
			aria-label="Fermer"
			class="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M6 6l12 12M6 18L18 6" />
			</svg>
		</button>
		<img
			src={vercelImage(expandedThumb.thumbnail_url, 1920, 85)}
			alt={expandedThumb.title}
			on:error={() => {
				markThumbFailed(expandedThumb!.id);
				closeThumb();
			}}
			class="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl"
		/>
	</div>
{/if}

<style>
	.default-thumbnail {
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 136, 12, 0.08), transparent 60%),
			linear-gradient(135deg, #faf6f1 0%, #f1eae0 100%);
	}
	.animate-lightbox-in {
		animation: lightbox-fade 0.18s ease-out;
	}
	@keyframes lightbox-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
