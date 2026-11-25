<script lang="ts">
	import { onMount } from 'svelte';
	import { locale, t, type TranslationKey } from '../../i18n';
	import type { LiveDiscovery } from '$lib/server/live-discovery';

	let {
		initial,
		current = $bindable(),
		onLivePage = false
	}: { initial: LiveDiscovery; current?: LiveDiscovery; onLivePage?: boolean } = $props();
	let localTime = $state(false);
	const action = $derived(current ?? initial);
	const upcoming = $derived(
		action.kind === 'scheduled' ? action : action.kind === 'live' ? action.upcoming : null
	);
	const label: Record<Exclude<LiveDiscovery['kind'], 'scheduled'>, TranslationKey> = {
		live: 'home.listenLive',
		replay: 'live.discovery.latestReplay',
		library: 'live.discovery.library'
	};

	onMount(() => {
		localTime = true;
		const controller = new AbortController();
		let loading = false;
		async function refresh() {
			if (loading || document.visibilityState !== 'visible') return;
			loading = true;
			try {
				const response = await fetch('/api/live/discovery', { signal: controller.signal });
				if (response.ok) current = await response.json();
			} catch {
				// Keep the last known action when the listener is offline.
			} finally {
				loading = false;
			}
		}
		function onPush(event: MessageEvent) {
			if (event.data?.type === 'RADIO_PUSH') void refresh();
		}
		void refresh();
		const interval = window.setInterval(refresh, 30_000);
		document.addEventListener('visibilitychange', refresh);
		navigator.serviceWorker?.addEventListener('message', onPush);
		window.addEventListener('online', refresh);
		return () => {
			controller.abort();
			window.clearInterval(interval);
			document.removeEventListener('visibilitychange', refresh);
			navigator.serviceWorker?.removeEventListener('message', onPush);
			window.removeEventListener('online', refresh);
		};
	});
</script>

{#if action.kind !== 'scheduled' && (!onLivePage || action.href !== '/live')}
	<a
		href={action.href}
		class="inline-flex min-h-11 flex-col items-center justify-center gap-1 px-6 py-3 text-center font-body text-white transition-colors sm:px-8 {action.kind ===
		'live'
			? 'bg-red-700 hover:bg-red-800'
			: 'bg-stone-900 hover:bg-missionnaire'}"
	>
		<span class="text-[12px] font-semibold uppercase tracking-[0.15em]"
			>{$t(label[action.kind])}</span
		>
	</a>
{/if}

{#if upcoming && (onLivePage || action.kind === 'scheduled')}
	{@const date = new Date(upcoming.scheduledAt)}
	{@const timeZone = localTime ? undefined : 'UTC'}
	{@const title = upcoming.title.replace(
		/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}[h:]\d{2}\s*[-–—]\s+(?=\S)/u,
		''
	)}
	{@const krefeld = /^retransmission de krefeld(\s+\([a-z]{2}\))?\s+-\s+(.+)$/i.exec(title)}
	<a
		href={upcoming.href}
		class="group grid w-full grid-cols-[3rem_minmax(0,1fr)_0.75rem] items-center gap-x-3 border border-stone-200 border-l-2 border-l-missionnaire bg-white/60 px-3.5 py-3.5 text-left font-body text-stone-900 transition-colors hover:border-missionnaire/60 hover:bg-white/90 sm:grid-cols-[4rem_minmax(0,1fr)_1rem] sm:gap-x-4 sm:px-5 sm:py-4"
	>
		<span
			aria-hidden="true"
			class="flex flex-col items-center gap-1 border-r border-stone-200 pr-3 text-stone-700 sm:pr-4"
		>
			<span
				class="font-display text-[2rem] font-semibold tabular-nums leading-none sm:text-[2.35rem]"
			>
				{date.toLocaleDateString($locale, { day: 'numeric', timeZone })}
			</span>
			<span class="text-xs font-medium leading-none"
				>{date.toLocaleDateString($locale, { month: 'short', timeZone })}</span
			>
		</span>
		<span class="min-w-0">
			<span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-snug">
				<span class="font-semibold text-earth-dark">{$t('live.discovery.nextService')}</span>
				<time
					datetime={upcoming.scheduledAt}
					aria-label={date.toLocaleString($locale, {
						dateStyle: 'long',
						timeStyle: 'short',
						timeZone
					}) + (localTime ? '' : ' UTC')}
					class="text-stone-600"
				>
					{date.toLocaleTimeString($locale, { timeStyle: 'short', timeZone })}{localTime
						? ''
						: ' UTC'}
				</time>
			</span>
			<span
				class="mt-1 block break-words font-display text-xl font-semibold leading-[1.12] sm:text-[1.55rem]"
			>
				{krefeld ? `Retransmission de Krefeld${krefeld[1] ?? ''}` : title}
			</span>
			{#if krefeld}
				<span class="mt-1 block break-words text-xs leading-snug text-stone-600 sm:text-sm"
					>{krefeld[2]}</span
				>
			{/if}
		</span>
		<span
			aria-hidden="true"
			class="h-2 w-2 rotate-45 justify-self-center border-r border-t border-stone-500 group-hover:border-earth-dark"
		></span>
	</a>
{/if}
