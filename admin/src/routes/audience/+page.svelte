<script lang="ts">
	import type { AudienceData, AudienceRange } from '../../lib/server/audience';
	import { locale } from '$lib/i18n';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';

	let {
		data
	}: {
		data: { days: AudienceRange; audience: AudienceData; updatedAt: string; isPreview: boolean };
	} = $props();
	const refreshIntervalMs = $derived(data.days === '5m' ? 30_000 : 5 * 60_000);
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
			if (document.visibilityState !== 'visible') return;
			const lastChecked = Math.max(Date.parse(data.updatedAt), lastRefreshAttempt);
			if (Date.now() - lastChecked >= refreshIntervalMs) void refreshData();
		};
		const timer = window.setInterval(refreshIfStale, 10_000);
		document.addEventListener('visibilitychange', refreshIfStale);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', refreshIfStale);
		};
	});
	const copy = $derived(
		$locale === 'fr'
			? {
					title: 'Audience du site',
					intro:
						'Comprendre ce que les visiteurs consultent et écoutent pour choisir où concentrer vos efforts.',
					period: 'Période',
					fiveMinutes: '5 min',
					days: 'jours',
					visitors: 'Visiteurs',
					visits: 'Visites',
					pageViews: 'Pages vues',
					listens: 'Écoutes',
					trend: 'Visiteurs par jour',
					trendRecent: 'Visiteurs par minute',
					pages: 'Pages les plus visitées',
					pageMetric: 'Visiteurs par page et par jour',
					pageMetricRecent: 'Pages vues pendant les 5 dernières minutes',
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
					refresh: 'Actualiser',
					refreshing: 'Actualisation…',
					refreshFailed: 'Actualisation impossible. Réessayez.',
					preview: 'Aperçu local : seules les visites sur localhost apparaissent ici.',
					note: 'Les visites proviennent de navigateurs confirmés. Les robots reconnus sont exclus. Une écoute est comptée après 10 secondes de lecture, une fois par visiteur, contenu et jour. Les écoutes sont enregistrées à partir de la mise en ligne de cette fonctionnalité.',
					noteRecent:
						'Cette vue montre les visites confirmées pendant les 5 dernières minutes. Les robots reconnus sont exclus. Une écoute est comptée après 10 secondes de lecture, une fois par visiteur et contenu dans cette période. Les données récentes commencent à partir de la mise en ligne de cette fonctionnalité.'
				}
			: {
					title: 'Website audience',
					intro:
						'See what visitors read and listen to so you can decide where to focus your efforts.',
					period: 'Period',
					fiveMinutes: '5 min',
					days: 'days',
					visitors: 'Visitors',
					visits: 'Visits',
					pageViews: 'Page views',
					listens: 'Listens',
					trend: 'Visitors by day',
					trendRecent: 'Visitors by minute',
					pages: 'Most visited pages',
					pageMetric: 'Visitors per page per day',
					pageMetricRecent: 'Page views in the last 5 minutes',
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
					refresh: 'Refresh now',
					refreshing: 'Refreshing…',
					refreshFailed: 'Could not refresh. Try again.',
					preview: 'Local preview: only visits on localhost appear here.',
					note: 'Visits come from confirmed browsers. Recognized bots are excluded. A listen counts after 10 seconds of playback, once per visitor, item, and day. Listening data begins when this feature goes live.',
					noteRecent:
						'This view shows confirmed visits in the last 5 minutes. Recognized bots are excluded. A listen counts after 10 seconds of playback, once per visitor and item in this period. Recent data begins when this feature goes live.'
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
	const daily = $derived.by(() => {
		if (data.days === '5m') return [];
		const byDate = new Map(data.audience.daily.map((row) => [row.date, row.visitors]));
		const result: { date: string; visitors: number }[] = [];
		const day = new Date(`${data.audience.from}T00:00:00Z`);
		for (let i = 0; i < data.days; i++) {
			const date = day.toISOString().slice(0, 10);
			result.push({ date, visitors: byDate.get(date) ?? 0 });
			day.setUTCDate(day.getUTCDate() + 1);
		}
		return result;
	});
	const chartRows = $derived.by(() => {
		if (data.days === '5m') {
			const startedAt = Date.parse(data.audience.windowStartedAt ?? data.updatedAt);
			const counts = new Map(data.audience.minutes.map((row) => [row.slot, row.visitors]));
			return Array.from({ length: 5 }, (_, slot) => ({
				label: minuteFormat.format(new Date(startedAt + slot * 60_000)),
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
		...(data.days === '5m' ? [] : [{ label: copy.visits, value: data.audience.visits }]),
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
		<nav
			aria-label={copy.period}
			class="grid w-full grid-cols-4 border border-stone-300 bg-white sm:flex sm:w-auto sm:shrink-0"
		>
			{#each [{ value: '5m', label: copy.fiveMinutes }, { value: 7, label: `7 ${copy.days}` }, { value: 30, label: `30 ${copy.days}` }, { value: 90, label: `90 ${copy.days}` }] as period}
				<a
					href={`/audience?days=${period.value}`}
					aria-current={data.days === period.value ? 'page' : undefined}
					class="whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold transition-colors sm:px-4 sm:text-sm {data.days ===
					period.value
						? 'bg-stone-900 text-white'
						: 'text-stone-600 hover:bg-stone-100'}"
				>
					{period.label}
				</a>
			{/each}
		</nav>
	</header>
	<div
		class="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-600"
		aria-live="polite"
	>
		<p>
			{copy.updated}
			{updatedTime} · {data.days === '5m' ? copy.autoRefreshRecent : copy.autoRefresh}
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
		class="grid grid-cols-2 gap-px overflow-hidden border border-stone-200 bg-stone-200 {data.days ===
		'5m'
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
			{data.days === '5m' ? copy.trendRecent : copy.trend}
		</h2>
		<div
			class="mt-6 flex h-44 items-end gap-0.5 border-b border-stone-200 sm:gap-1"
			role="img"
			aria-label={data.days === '5m' ? copy.trendRecent : copy.trend}
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
				>{data.days === '5m' ? updatedTime : chartRows.at(-1)?.label}</span
			>
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
		<section class="border border-stone-200 bg-white p-5 sm:p-7" aria-labelledby="audience-pages">
			<h2 id="audience-pages" class="font-display text-2xl font-semibold text-stone-900">
				{copy.pages}
			</h2>
			<p class="mt-1 text-xs text-stone-500">
				{data.days === '5m' ? copy.pageMetricRecent : copy.pageMetric}
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
		{data.days === '5m' ? copy.noteRecent : copy.note}
	</p>
</div>
