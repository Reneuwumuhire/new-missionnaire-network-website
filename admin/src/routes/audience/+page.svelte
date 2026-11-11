<script lang="ts">
	import type { AudienceData } from '../../lib/server/audience';
	import type { AudiencePeriod, AudienceRange } from '../../lib/server/audience-period';
	import { locale } from '$lib/i18n';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';

	let {
		data
	}: {
		data: {
			period: AudiencePeriod;
			audience: AudienceData;
			updatedAt: string;
			isPreview: boolean;
		};
	} = $props();
	const refreshIntervalMs = $derived(
		data.period.recentMinutes !== null && data.period.recentMinutes <= 30
			? 30_000
			: data.period.recentMinutes !== null && data.period.recentMinutes <= 240
				? 60_000
				: 5 * 60_000
	);
	const isRecent = $derived(data.period.recentMinutes !== null);
	let autoRefresh = $state(true);
	let pickerOpen = $state(false);
	let pickerRef: HTMLDivElement | undefined = $state(undefined);
	let customFrom = $state('');
	let customThrough = $state('');
	let refreshing = $state(false);
	let refreshError = $state(false);
	let lastRefreshAttempt = 0;

	async function refreshData(): Promise<void> {
		if (refreshing) return;
		refreshing = true;
		lastRefreshAttempt = Date.now();
		try {
			await invalidate('app:audience');
			refreshError = false;
		} catch {
			refreshError = true;
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		const refreshIfStale = () => {
			if (!autoRefresh || document.visibilityState !== 'visible') return;
			const lastChecked = Math.max(Date.parse(data.updatedAt), lastRefreshAttempt);
			if (Date.now() - lastChecked >= refreshIntervalMs) void refreshData();
		};
		const closePicker = (event: PointerEvent) => {
			if (pickerRef && !pickerRef.contains(event.target as Node)) pickerOpen = false;
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') pickerOpen = false;
		};
		const timer = window.setInterval(refreshIfStale, 10_000);
		document.addEventListener('visibilitychange', refreshIfStale);
		document.addEventListener('pointerdown', closePicker);
		document.addEventListener('keydown', closeOnEscape);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', refreshIfStale);
			document.removeEventListener('pointerdown', closePicker);
			document.removeEventListener('keydown', closeOnEscape);
		};
	});
	function togglePicker() {
		if (!pickerOpen) {
			customFrom = data.period.from;
			customThrough = data.period.through;
		}
		pickerOpen = !pickerOpen;
	}
	const copy = $derived(
		$locale === 'fr'
			? {
					title: 'Audience du site',
					intro:
						'Comprendre ce que les visiteurs consultent et écoutent pour choisir où concentrer vos efforts.',
					period: 'Période',
					quickRanges: 'Périodes rapides',
					calendarRanges: 'Périodes calendaires',
					customRange: 'Dates personnalisées',
					fromDate: 'Du',
					throughDate: 'Au',
					applyRange: 'Afficher',
					invalidRange: 'Choisissez au plus 366 jours, sans date future.',
					pauseRefresh: 'Suspendre l’actualisation automatique',
					resumeRefresh: 'Reprendre l’actualisation automatique',
					pausedRefresh: 'Actualisation automatique suspendue',
					rangeLabels: {
						'5m': '5 dernières minutes',
						'15m': '15 dernières minutes',
						'30m': '30 dernières minutes',
						'1h': 'Dernière heure',
						'4h': '4 dernières heures',
						'1d': 'Dernières 24 heures',
						'2d': 'Dernières 48 heures',
						'7': '7 derniers jours',
						'30': '30 derniers jours',
						'90': '90 derniers jours',
						today: 'Aujourd’hui',
						yesterday: 'Hier',
						week_to_date: 'Semaine en cours',
						previous_week: 'Semaine précédente',
						month_to_date: 'Mois en cours',
						previous_month: 'Mois précédent',
						year_to_date: 'Année en cours',
						previous_year: 'Année précédente',
						custom: 'Dates personnalisées'
					} satisfies Record<AudienceRange, string>,
					visitors: 'Visiteurs',
					visits: 'Visites',
					pageViews: 'Pages vues',
					listens: 'Écoutes',
					trend: 'Visiteurs par jour',
					trendRecent: 'Visiteurs dans le temps',
					pages: 'Pages les plus visitées',
					pageMetric: 'Visiteurs par page et par jour',
					pageMetricRecent: 'Pages vues pendant la période sélectionnée',
					listening: 'Ce que les visiteurs écoutent',
					live: 'Radio en direct',
					sermons: 'Prédications',
					songs: 'Chants audio',
					videos: 'Vidéos musicales',
					recordings: 'Rediffusions',
					topSermons: 'Prédications les plus écoutées',
					topSongs: 'Chants les plus écoutés',
					topRecordings: 'Rediffusions les plus écoutées',
					devices: 'Appareils',
					countries: 'Pays',
					sources: 'Origine des visites',
					direct: 'Accès direct',
					unknown: 'Inconnu',
					empty: 'Aucune donnée pour cette période.',
					updated: 'Mis à jour à',
					autoRefresh: 'Actualisation automatique toutes les 5 min',
					autoRefreshRecent: 'Actualisation automatique toutes les 30 s',
					autoRefreshMinute: 'Actualisation automatique toutes les minutes',
					refresh: 'Actualiser',
					refreshing: 'Actualisation…',
					refreshFailed: 'Actualisation impossible. Réessayez.',
					preview: 'Aperçu local : seules les visites sur localhost apparaissent ici.',
					note: 'Les visites proviennent de navigateurs confirmés. Les robots reconnus sont exclus. Une écoute est comptée après 10 secondes de lecture, une fois par visiteur, contenu et jour. Les écoutes sont enregistrées à partir de la mise en ligne de cette fonctionnalité.',
					noteRecent:
						'Cette vue montre les visites confirmées pendant la période sélectionnée. Les robots reconnus sont exclus. Une écoute est comptée après 10 secondes de lecture, une fois par visiteur et contenu dans cette période. Les données récentes commencent à partir de la mise en ligne de cette fonctionnalité.'
				}
			: {
					title: 'Website audience',
					intro:
						'See what visitors read and listen to so you can decide where to focus your efforts.',
					period: 'Period',
					quickRanges: 'Quick ranges',
					calendarRanges: 'Calendar ranges',
					customRange: 'Custom dates',
					fromDate: 'From',
					throughDate: 'Through',
					applyRange: 'Apply dates',
					invalidRange: 'Choose up to 366 days with no future dates.',
					pauseRefresh: 'Pause automatic refresh',
					resumeRefresh: 'Resume automatic refresh',
					pausedRefresh: 'Automatic refresh paused',
					rangeLabels: {
						'5m': 'Past 5 minutes',
						'15m': 'Past 15 minutes',
						'30m': 'Past 30 minutes',
						'1h': 'Past 1 hour',
						'4h': 'Past 4 hours',
						'1d': 'Past 24 hours',
						'2d': 'Past 48 hours',
						'7': 'Past 7 days',
						'30': 'Past 30 days',
						'90': 'Past 90 days',
						today: 'Today',
						yesterday: 'Yesterday',
						week_to_date: 'Week to date',
						previous_week: 'Previous week',
						month_to_date: 'Month to date',
						previous_month: 'Previous month',
						year_to_date: 'Year to date',
						previous_year: 'Previous year',
						custom: 'Custom dates'
					} satisfies Record<AudienceRange, string>,
					visitors: 'Visitors',
					visits: 'Visits',
					pageViews: 'Page views',
					listens: 'Listens',
					trend: 'Visitors by day',
					trendRecent: 'Visitors over time',
					pages: 'Most visited pages',
					pageMetric: 'Visitors per page per day',
					pageMetricRecent: 'Page views in the selected period',
					listening: 'What visitors listen to',
					live: 'Live radio',
					sermons: 'Sermons',
					songs: 'Audio songs',
					videos: 'Music videos',
					recordings: 'Replays',
					topSermons: 'Most listened sermons',
					topSongs: 'Most listened songs',
					topRecordings: 'Most listened replays',
					devices: 'Devices',
					countries: 'Countries',
					sources: 'Visit sources',
					direct: 'Direct',
					unknown: 'Unknown',
					empty: 'No data for this period.',
					updated: 'Updated at',
					autoRefresh: 'Refreshes automatically every 5 min',
					autoRefreshRecent: 'Refreshes automatically every 30 sec',
					autoRefreshMinute: 'Refreshes automatically every minute',
					refresh: 'Refresh now',
					refreshing: 'Refreshing…',
					refreshFailed: 'Could not refresh. Try again.',
					preview: 'Local preview: only visits on localhost appear here.',
					note: 'Visits come from confirmed browsers. Recognized bots are excluded. A listen counts after 10 seconds of playback, once per visitor, item, and day. Listening data begins when this feature goes live.',
					noteRecent:
						'This view shows confirmed visits in the selected period. Recognized bots are excluded. A listen counts after 10 seconds of playback, once per visitor and item in this period. Recent data begins when this feature goes live.'
				}
	);

	const number = $derived(new Intl.NumberFormat($locale === 'fr' ? 'fr-FR' : 'en-US'));
	const updatedTime = $derived(
		new Intl.DateTimeFormat($locale === 'fr' ? 'fr-FR' : 'en-US', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Africa/Kigali'
		}).format(new Date(data.updatedAt))
	);
	const dateFormat = $derived(
		new Intl.DateTimeFormat($locale === 'fr' ? 'fr-FR' : 'en-US', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		})
	);
	const minuteFormat = $derived(
		new Intl.DateTimeFormat($locale === 'fr' ? 'fr-FR' : 'en-US', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Africa/Kigali'
		})
	);
	const dateTimeFormat = $derived(
		new Intl.DateTimeFormat($locale === 'fr' ? 'fr-FR' : 'en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Africa/Kigali'
		})
	);
	const maxDate = $derived(
		new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Africa/Kigali',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(new Date(data.updatedAt))
	);
	const quickRanges: AudienceRange[] = [
		'5m',
		'15m',
		'30m',
		'1h',
		'4h',
		'1d',
		'2d',
		'7',
		'30',
		'90'
	];
	const calendarRanges: AudienceRange[] = [
		'today',
		'yesterday',
		'week_to_date',
		'previous_week',
		'month_to_date',
		'previous_month',
		'year_to_date',
		'previous_year'
	];
	const selectedPeriodLabel = $derived(
		data.period.key === 'custom'
			? `${data.period.from} – ${data.period.through}`
			: copy.rangeLabels[data.period.key]
	);
	const refreshDescription = $derived(
		!autoRefresh
			? copy.pausedRefresh
			: refreshIntervalMs === 30_000
				? copy.autoRefreshRecent
				: refreshIntervalMs === 60_000
					? copy.autoRefreshMinute
					: copy.autoRefresh
	);
	const customDateValid = $derived(
		/^\d{4}-\d{2}-\d{2}$/.test(customFrom) &&
			/^\d{4}-\d{2}-\d{2}$/.test(customThrough) &&
			customFrom <= customThrough &&
			customThrough <= maxDate &&
			(Date.parse(customThrough) - Date.parse(customFrom)) / 86_400_000 < 366
	);
	const daily = $derived.by(() => {
		if (isRecent) return [];
		const byDate = new Map(data.audience.daily.map((row) => [row.date, row.visitors]));
		const result: { date: string; visitors: number }[] = [];
		const day = new Date(`${data.audience.from}T00:00:00Z`);
		const dayCount =
			(Date.parse(data.audience.through) - Date.parse(data.audience.from)) / 86_400_000 + 1;
		for (let i = 0; i < dayCount; i++) {
			const date = day.toISOString().slice(0, 10);
			result.push({ date, visitors: byDate.get(date) ?? 0 });
			day.setUTCDate(day.getUTCDate() + 1);
		}
		return result;
	});
	const chartRows = $derived.by(() => {
		if (isRecent) {
			const startedAt = Date.parse(data.audience.windowStartedAt ?? data.updatedAt);
			const counts = new Map(data.audience.timeBuckets.map((row) => [row.slot, row.visitors]));
			return Array.from({ length: data.period.bucketCount }, (_, slot) => ({
				label:
					(data.period.recentMinutes ?? 0) >= 1_440
						? dateTimeFormat.format(new Date(startedAt + slot * data.period.bucketMinutes * 60_000))
						: minuteFormat.format(new Date(startedAt + slot * data.period.bucketMinutes * 60_000)),
				visitors: counts.get(slot) ?? 0
			}));
		}
		return daily.map((row) => ({
			label: dateFormat.format(new Date(`${row.date}T00:00:00Z`)),
			visitors: row.visitors
		}));
	});
	const maxChart = $derived(Math.max(1, ...chartRows.map((row) => row.visitors)));
	const playCount = $derived(
		(kind: string) => data.audience.plays.find((row) => row.kind === kind)?.count ?? 0
	);
	const allListens = $derived(data.audience.plays.reduce((sum, row) => sum + row.count, 0));
	const metrics = $derived([
		{ label: copy.visitors, value: data.audience.visitors },
		...(isRecent ? [] : [{ label: copy.visits, value: data.audience.visits }]),
		{ label: copy.pageViews, value: data.audience.pageVisits },
		{ label: copy.listens, value: allListens }
	]);
	const listeningGroups = $derived([
		{ label: copy.live, count: playCount('live') },
		{ label: copy.sermons, count: playCount('sermon') },
		{ label: copy.songs, count: playCount('song') },
		{ label: copy.videos, count: playCount('song_video') },
		{ label: copy.recordings, count: playCount('recording') }
	]);
	const topGroups = $derived([
		{ title: copy.topSermons, rows: data.audience.topSermons },
		{ title: copy.topSongs, rows: data.audience.topSongs },
		{ title: copy.topRecordings, rows: data.audience.topRecordings }
	]);
	const distributionGroups = $derived([
		{
			title: copy.devices,
			rows: data.audience.devices.map((row) => ({
				name: row.name || copy.unknown,
				count: row.count
			}))
		},
		{
			title: copy.countries,
			rows: data.audience.countries.map((row) => ({
				name: row.name || copy.unknown,
				count: row.count
			}))
		},
		{
			title: copy.sources,
			rows: data.audience.referrers.map((row) => ({
				name: formatSource(row.name),
				count: row.count
			}))
		}
	]);
	function formatSource(value: string): string {
		if (!value || value === 'direct') return copy.direct;
		try {
			return new URL(value).hostname;
		} catch {
			return value;
		}
	}
</script>

<svelte:head><title>{copy.title} — Missionnaire Admin</title></svelte:head>

<div class="mx-auto max-w-7xl space-y-7 pb-10">
	<header
		class="flex flex-col gap-5 border-b border-stone-300 pb-6 md:flex-row md:items-end md:justify-between"
	>
		<div>
			<h1 class="font-display text-4xl font-semibold text-stone-900 sm:text-5xl">{copy.title}</h1>
			<p class="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">{copy.intro}</p>
		</div>
		<div class="flex w-full items-stretch gap-2 sm:w-auto sm:shrink-0">
			<div class="relative min-w-0 flex-1 sm:w-64" bind:this={pickerRef}>
				<button
					type="button"
					class="flex h-full min-h-11 w-full items-center justify-between gap-3 border border-stone-300 bg-white px-4 text-left text-sm font-semibold text-stone-900 hover:border-stone-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					aria-label={`${copy.period}: ${selectedPeriodLabel}`}
					aria-expanded={pickerOpen}
					aria-controls="audience-range-menu"
					onclick={togglePicker}
				>
					<span class="min-w-0 truncate">{selectedPeriodLabel}</span>
					<svg class="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
						<path d="m5 7.5 5 5 5-5" stroke="currentColor" stroke-width="1.7" />
					</svg>
				</button>
				{#if pickerOpen}
					<div
						id="audience-range-menu"
						class="absolute right-0 top-full z-30 mt-1 max-h-[min(75vh,40rem)] w-[min(25rem,calc(100vw-2rem))] overflow-y-auto border border-stone-300 bg-white p-4 shadow-xl"
					>
						<nav aria-label={copy.quickRanges}>
							<p class="mb-2 text-xs font-semibold text-stone-500">{copy.quickRanges}</p>
							<div class="grid grid-cols-2 gap-1">
								{#each quickRanges as range}
									<a
										href={`/audience?days=${range}`}
										aria-current={data.period.key === range ? 'page' : undefined}
										onclick={() => (pickerOpen = false)}
										class="px-3 py-2 text-sm leading-snug hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-primary {data
											.period.key === range
											? 'bg-stone-900 font-semibold text-white hover:bg-stone-800'
											: 'text-stone-700'}">{copy.rangeLabels[range]}</a
									>
								{/each}
							</div>
						</nav>
						<nav aria-label={copy.calendarRanges} class="mt-4 border-t border-stone-200 pt-4">
							<p class="mb-2 text-xs font-semibold text-stone-500">{copy.calendarRanges}</p>
							<div class="grid grid-cols-2 gap-1">
								{#each calendarRanges as range}
									<a
										href={`/audience?days=${range}`}
										aria-current={data.period.key === range ? 'page' : undefined}
										onclick={() => (pickerOpen = false)}
										class="px-3 py-2 text-sm leading-snug hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-primary {data
											.period.key === range
											? 'bg-stone-900 font-semibold text-white hover:bg-stone-800'
											: 'text-stone-700'}">{copy.rangeLabels[range]}</a
									>
								{/each}
							</div>
						</nav>
						<form
							action="/audience"
							method="GET"
							class="mt-4 border-t border-stone-200 pt-4"
							onsubmit={() => (pickerOpen = false)}
						>
							<p class="mb-3 text-xs font-semibold text-stone-500">{copy.customRange}</p>
							<input type="hidden" name="days" value="custom" />
							<div class="grid grid-cols-2 gap-3">
								<label class="space-y-1 text-xs font-medium text-stone-600">
									<span>{copy.fromDate}</span>
									<input
										type="date"
										name="from"
										max={maxDate}
										required
										bind:value={customFrom}
										class="w-full border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 focus-visible:outline-2 focus-visible:outline-primary"
									/>
								</label>
								<label class="space-y-1 text-xs font-medium text-stone-600">
									<span>{copy.throughDate}</span>
									<input
										type="date"
										name="through"
										min={customFrom}
										max={maxDate}
										required
										bind:value={customThrough}
										class="w-full border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 focus-visible:outline-2 focus-visible:outline-primary"
									/>
								</label>
							</div>
							{#if !customDateValid}<p class="mt-2 text-xs text-red-700">
									{copy.invalidRange}
								</p>{/if}
							<button
								type="submit"
								disabled={!customDateValid}
								class="mt-3 w-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
								>{copy.applyRange}</button
							>
						</form>
					</div>
				{/if}
			</div>
			<button
				type="button"
				class="flex h-11 w-11 shrink-0 items-center justify-center border border-stone-300 bg-white text-stone-800 hover:border-stone-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
				aria-label={autoRefresh ? copy.pauseRefresh : copy.resumeRefresh}
				title={autoRefresh ? copy.pauseRefresh : copy.resumeRefresh}
				onclick={() => (autoRefresh = !autoRefresh)}
			>
				{#if autoRefresh}
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
						<rect x="4" y="3" width="4" height="14" /><rect x="12" y="3" width="4" height="14" />
					</svg>
				{:else}
					<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
						<path d="M5 3.5v13l11-6.5L5 3.5Z" />
					</svg>
				{/if}
			</button>
		</div>
	</header>
	<div
		class="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-600"
		aria-live="polite"
	>
		<p>
			{copy.updated}
			{updatedTime} · {refreshDescription}
		</p>
		{#if data.isPreview}<p class="w-full text-amber-800">{copy.preview}</p>{/if}
		<button
			type="button"
			onclick={refreshData}
			disabled={refreshing}
			class="border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60"
		>
			{refreshing ? copy.refreshing : copy.refresh}
		</button>
		{#if refreshError}<p class="w-full text-red-700">{copy.refreshFailed}</p>{/if}
	</div>

	<div
		class="grid grid-cols-2 gap-px overflow-hidden border border-stone-200 bg-stone-200 {isRecent
			? 'lg:grid-cols-3'
			: 'lg:grid-cols-4'}"
	>
		{#each metrics as metric}
			<div class="bg-white px-4 py-5 sm:px-6">
				<p class="text-sm text-stone-600">{metric.label}</p>
				<p class="mt-3 font-display text-4xl font-semibold tabular-nums text-stone-900 sm:text-5xl">
					{number.format(metric.value)}
				</p>
			</div>
		{/each}
	</div>

	<section class="border border-stone-200 bg-white p-5 sm:p-7" aria-labelledby="audience-trend">
		<h2 id="audience-trend" class="font-display text-2xl font-semibold text-stone-900">
			{isRecent ? copy.trendRecent : copy.trend}
		</h2>
		<div
			class="mt-6 flex h-44 items-end gap-0.5 border-b border-stone-200 sm:gap-1"
			role="img"
			aria-label={isRecent ? copy.trendRecent : copy.trend}
		>
			{#each chartRows as row}
				<div
					class="group relative flex h-full min-w-0 flex-1 items-end"
					title={`${row.label}: ${number.format(row.visitors)}`}
				>
					<div
						class="w-full bg-primary/75 group-hover:bg-primary"
						style={`height: ${row.visitors ? Math.max(3, (row.visitors / maxChart) * 100) : 0}%`}
					></div>
				</div>
			{/each}
		</div>
		<div class="mt-2 flex justify-between text-xs text-stone-500">
			<span>{chartRows[0]?.label}</span><span
				>{isRecent
					? (data.period.recentMinutes ?? 0) >= 1_440
						? dateTimeFormat.format(new Date(data.updatedAt))
						: updatedTime
					: chartRows.at(-1)?.label}</span
			>
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
		<section class="border border-stone-200 bg-white p-5 sm:p-7" aria-labelledby="audience-pages">
			<h2 id="audience-pages" class="font-display text-2xl font-semibold text-stone-900">
				{copy.pages}
			</h2>
			<p class="mt-1 text-xs text-stone-500">
				{isRecent ? copy.pageMetricRecent : copy.pageMetric}
			</p>
			<div class="mt-5 divide-y divide-stone-100">
				{#each data.audience.topPages as row}
					<div class="flex items-center justify-between gap-4 py-3 text-sm">
						<span class="min-w-0 break-all font-medium text-stone-800">{row.path}</span>
						<strong class="shrink-0 tabular-nums text-stone-900"
							>{number.format(row.visitors)}</strong
						>
					</div>
				{:else}<p class="py-6 text-sm text-stone-500">{copy.empty}</p>{/each}
			</div>
		</section>
		<section
			class="border border-stone-200 bg-white p-5 sm:p-7"
			aria-labelledby="audience-listening"
		>
			<h2 id="audience-listening" class="font-display text-2xl font-semibold text-stone-900">
				{copy.listening}
			</h2>
			<div class="mt-5 divide-y divide-stone-100">
				{#each listeningGroups as row}
					<div class="flex justify-between gap-3 py-3 text-sm">
						<span class="text-stone-700">{row.label}</span><strong class="tabular-nums"
							>{number.format(row.count)}</strong
						>
					</div>
				{/each}
			</div>
		</section>
	</div>

	<div class="grid gap-6 xl:grid-cols-3">
		{#each topGroups as group}
			<section class="border border-stone-200 bg-white p-5 sm:p-7">
				<h2 class="font-display text-2xl font-semibold text-stone-900">{group.title}</h2>
				<div class="mt-5 divide-y divide-stone-100">
					{#each group.rows as row}
						<div class="flex items-start justify-between gap-3 py-3 text-sm">
							<span class="min-w-0 break-words text-stone-700">{row.title}</span><strong
								class="shrink-0 tabular-nums">{number.format(row.count)}</strong
							>
						</div>
					{:else}<p class="py-6 text-sm text-stone-500">{copy.empty}</p>{/each}
				</div>
			</section>
		{/each}
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		{#each distributionGroups as group}
			<section class="border border-stone-200 bg-white p-5 sm:p-7">
				<h2 class="font-display text-2xl font-semibold text-stone-900">{group.title}</h2>
				<div class="mt-5 divide-y divide-stone-100">
					{#each group.rows as row}<div class="flex justify-between gap-3 py-3 text-sm">
							<span class="min-w-0 truncate text-stone-700">{row.name}</span><strong
								class="tabular-nums">{number.format(row.count)}</strong
							>
						</div>
					{:else}<p class="py-6 text-sm text-stone-500">{copy.empty}</p>{/each}
				</div>
			</section>
		{/each}
	</div>
	<p class="max-w-4xl border-l-2 border-primary pl-4 text-xs leading-relaxed text-stone-600">
		{isRecent ? copy.noteRecent : copy.note}
	</p>
</div>
