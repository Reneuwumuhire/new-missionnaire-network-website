<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import LiveRadioPlayer from '$lib/components/+liveRadioPlayer.svelte';
	import ShareLive from '$lib/components/+shareLive.svelte';
	import NotificationBell from '$lib/components/+notificationBell.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let bellRef: any;

	// Phase is server-rendered for first paint (possibly ≤60s stale from the
	// edge cache), then kept current by polling the no-store watch endpoint —
	// that's what flips the waiting room into the live player without a reload.
	let phase = data.watch.phase;
	$: watch = data.watch;

	$: shareUrl = browser
		? `${window.location.origin}/live/${watch.slug}`
		: `https://missionnaire.net/live/${watch.slug}`;

	// ── Countdown (viewer-local timezone) ──────────────────────────
	let now = Date.now();
	$: scheduledMs = Date.parse(watch.scheduledAt);
	$: remainingMs = Math.max(0, scheduledMs - now);
	$: countdown = {
		days: Math.floor(remainingMs / 86_400_000),
		hours: Math.floor((remainingMs % 86_400_000) / 3_600_000),
		minutes: Math.floor((remainingMs % 3_600_000) / 60_000),
		seconds: Math.floor((remainingMs % 60_000) / 1000)
	};
	// Countdown at zero does NOT mean on air — only the server says that.
	$: startingSoon = phase === 'scheduled' && remainingMs === 0;

	$: scheduledLocal = browser
		? new Date(scheduledMs).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })
		: '';

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	// ── Status polling ─────────────────────────────────────────────
	// 30s while the start is far off, 10s inside the last 5 minutes (and past
	// the scheduled time), paused while the tab is hidden. Also keeps running
	// during the live so the page forwards to the replay once it's published.
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;

	async function poll(): Promise<void> {
		try {
			const res = await fetch(`/api/live/watch/${watch.slug}`);
			if (!res.ok) return;
			const state = (await res.json()) as { phase: typeof phase; replayPath: string | null };
			if (state.replayPath) {
				stopPolling();
				goto(state.replayPath);
				return;
			}
			phase = state.phase;
		} catch {
			// Transient network error — next tick retries.
		}
	}

	function nextPollDelay(): number {
		const untilStart = scheduledMs - Date.now();
		return untilStart > 5 * 60_000 ? 30_000 : 10_000;
	}

	function scheduleNextPoll(): void {
		if (stopped || phase === 'cancelled') return;
		pollTimer = setTimeout(async () => {
			if (!document.hidden) await poll();
			scheduleNextPoll();
		}, nextPollDelay());
	}

	function stopPolling(): void {
		stopped = true;
		if (pollTimer) clearTimeout(pollTimer);
	}

	function handleVisibilityChange(): void {
		// Coming back to the tab: refresh immediately instead of waiting out the
		// remainder of a (possibly long) sleep tick.
		if (!document.hidden && !stopped) void poll();
	}

	let countdownTimer: ReturnType<typeof setInterval> | null = null;
	onMount(() => {
		countdownTimer = setInterval(() => (now = Date.now()), 1000);
		scheduleNextPoll();
	});
	onDestroy(() => {
		stopPolling();
		if (countdownTimer) clearInterval(countdownTimer);
	});
</script>

<svelte:document on:visibilitychange={handleVisibilityChange} />

<section class="w-full px-6 pt-4 pb-10 md:pt-6">
	<div class="max-w-2xl mx-auto">
		{#if phase === 'live'}
			<!-- ── On air: same experience as /live, scoped to this broadcast ── -->
			<div class="text-center mb-6 md:mb-10">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-2 md:mb-3 font-body"
				>
					<span class="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1 align-middle"
					></span>
					En direct
				</p>
				<h1 class="font-display text-2xl md:text-4xl font-semibold text-stone-900">
					{watch.title}
				</h1>
				{#if watch.description}
					<p
						class="mt-2 md:mt-3 text-[13px] md:text-[15px] text-stone-400 font-body font-light max-w-md mx-auto leading-relaxed whitespace-pre-line"
					>
						{watch.description}
					</p>
				{/if}
			</div>

			<LiveRadioPlayer />

			<ShareLive
				{shareUrl}
				title={`🔴 ${watch.title}`}
				text={`${watch.title} — en direct sur Missionnaire Network 🎙️`}
			/>
		{:else if phase === 'scheduled'}
			<!-- ── Waiting room (YouTube-style) ── -->
			<div class="text-center mb-5 md:mb-8">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-2 md:mb-3 font-body"
				>
					Direct programmé
				</p>
				<h1 class="font-display text-2xl md:text-4xl font-semibold text-stone-900">
					{watch.title}
				</h1>
				{#if scheduledLocal}
					<p class="mt-2 text-[13px] md:text-[14px] text-stone-500 font-body">
						{scheduledLocal}
						<span class="text-stone-300">· heure locale</span>
					</p>
				{/if}
			</div>

			<!-- Thumbnail hero -->
			<div
				class="relative overflow-hidden border border-stone-200/60 bg-stone-900 aspect-video w-full"
			>
				{#if watch.thumbnailUrl}
					<img
						src={watch.thumbnailUrl}
						alt={watch.title}
						class="absolute inset-0 h-full w-full object-cover opacity-90"
					/>
					<div class="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-transparent"></div>
				{:else}
					<!-- Styled placeholder when no thumbnail was set -->
					<div
						class="absolute inset-0 bg-gradient-to-br from-stone-800 via-stone-900 to-black flex items-center justify-center"
					>
						<svg width="64" height="56" viewBox="0 0 32 28" fill="none" aria-hidden="true">
							<rect x="0" y="8" width="4" height="12" rx="2" fill="#FF880C" fill-opacity="0.5" />
							<rect x="7" y="4" width="4" height="20" rx="2" fill="#FF880C" fill-opacity="0.6" />
							<rect x="14" y="2" width="4" height="24" rx="2" fill="#FF880C" fill-opacity="0.8" />
							<rect x="21" y="6" width="4" height="16" rx="2" fill="#FF880C" fill-opacity="0.6" />
							<rect x="28" y="9" width="4" height="10" rx="2" fill="#FF880C" fill-opacity="0.5" />
						</svg>
					</div>
				{/if}

				<!-- Countdown overlay -->
				<div class="absolute inset-x-0 bottom-0 p-4 md:p-6">
					{#if startingSoon}
						<p
							class="text-center text-white font-body text-sm md:text-base font-semibold animate-pulse"
						>
							Le direct va bientôt commencer…
						</p>
					{:else}
						<div class="flex items-end justify-center gap-2 md:gap-3 font-body">
							{#if countdown.days > 0}
								<div class="text-center">
									<div
										class="min-w-[52px] md:min-w-[64px] border border-white/20 bg-black/40 backdrop-blur-sm px-2 py-2 md:py-3 text-xl md:text-3xl font-semibold text-white tabular-nums"
									>
										{countdown.days}
									</div>
									<p
										class="mt-1 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-white/70"
									>
										{countdown.days > 1 ? 'Jours' : 'Jour'}
									</p>
								</div>
							{/if}
							<div class="text-center">
								<div
									class="min-w-[52px] md:min-w-[64px] border border-white/20 bg-black/40 backdrop-blur-sm px-2 py-2 md:py-3 text-xl md:text-3xl font-semibold text-white tabular-nums"
								>
									{pad(countdown.hours)}
								</div>
								<p
									class="mt-1 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-white/70"
								>
									Heures
								</p>
							</div>
							<div class="text-center">
								<div
									class="min-w-[52px] md:min-w-[64px] border border-white/20 bg-black/40 backdrop-blur-sm px-2 py-2 md:py-3 text-xl md:text-3xl font-semibold text-white tabular-nums"
								>
									{pad(countdown.minutes)}
								</div>
								<p
									class="mt-1 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-white/70"
								>
									Minutes
								</p>
							</div>
							<div class="text-center">
								<div
									class="min-w-[52px] md:min-w-[64px] border border-white/20 bg-black/40 backdrop-blur-sm px-2 py-2 md:py-3 text-xl md:text-3xl font-semibold text-white tabular-nums"
								>
									{pad(countdown.seconds)}
								</div>
								<p
									class="mt-1 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] text-white/70"
								>
									Secondes
								</p>
							</div>
						</div>
					{/if}
				</div>
			</div>

			{#if watch.description}
				<p
					class="mt-5 text-[13px] md:text-[15px] text-stone-500 font-body font-light leading-relaxed whitespace-pre-line text-center max-w-lg mx-auto"
				>
					{watch.description}
				</p>
			{/if}

			<!-- Notification opt-in — same block as /live -->
			<button
				on:click={() => bellRef?.toggle()}
				class="flex items-center gap-4 w-full text-left border px-5 py-4 mt-6 transition-all duration-300 cursor-pointer group {bellRef?.isSubscribed
					? 'border-missionnaire/30 bg-missionnaire/5'
					: 'border-stone-200/60 bg-white/40 hover:border-missionnaire/30 hover:bg-missionnaire/5 hover:-translate-y-0.5 hover:shadow-sm'}"
			>
				<div
					class="w-10 h-10 flex items-center justify-center shrink-0 border transition-colors duration-300 {bellRef?.isSubscribed
						? 'border-missionnaire/30 text-missionnaire'
						: 'border-stone-200/60 text-stone-400 group-hover:border-missionnaire/30 group-hover:text-missionnaire'}"
				>
					<NotificationBell bind:this={bellRef} />
				</div>
				<div class="font-body flex-1 min-w-0">
					{#if bellRef?.isSubscribed}
						<p class="text-sm font-semibold text-missionnaire">Notifications activées</p>
						<p class="text-[11px] text-stone-400 mt-0.5">Cliquez pour désactiver</p>
					{:else}
						<p
							class="text-sm font-semibold text-stone-700 group-hover:text-missionnaire transition-colors"
						>
							Me prévenir
						</p>
						<p class="text-[11px] text-stone-400 mt-0.5">
							Soyez alerté quand ce direct commence
						</p>
					{/if}
				</div>
				<span
					class="text-[11px] font-bold uppercase tracking-[0.15em] font-body shrink-0 transition-colors duration-300 {bellRef?.isSubscribed
						? 'text-missionnaire/60'
						: 'text-stone-300 group-hover:text-missionnaire'}"
				>
					{bellRef?.isSubscribed ? 'Activé' : 'Activer →'}
				</span>
			</button>

			<ShareLive
				{shareUrl}
				title={`Direct programmé : ${watch.title}`}
				text={`${watch.title} — direct programmé sur Missionnaire Network 🎙️`}
			/>
		{:else if phase === 'ended_pending'}
			<!-- ── Live over, replay not published yet ── -->
			<div class="text-center mb-6 md:mb-10">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.35em] text-stone-400 mb-2 md:mb-3 font-body"
				>
					Direct terminé
				</p>
				<h1 class="font-display text-2xl md:text-4xl font-semibold text-stone-900">
					{watch.title}
				</h1>
				<p
					class="mt-3 text-[13px] md:text-[15px] text-stone-400 font-body font-light max-w-md mx-auto leading-relaxed"
				>
					Ce direct est terminé. La rediffusion sera bientôt disponible — cette page vous y
					redirigera automatiquement.
				</p>
			</div>

			<ShareLive
				{shareUrl}
				title={watch.title}
				text={`${watch.title} — sur Missionnaire Network 🎙️`}
			/>

			<div class="mt-6 text-center">
				<a
					href="/live"
					class="inline-block text-[11px] font-bold uppercase tracking-[0.2em] font-body text-missionnaire hover:underline"
				>
					Voir les directs précédents →
				</a>
			</div>
		{:else}
			<!-- ── Cancelled ── -->
			<div class="text-center mb-6 md:mb-10">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.35em] text-stone-400 mb-2 md:mb-3 font-body"
				>
					Direct annulé
				</p>
				<h1 class="font-display text-2xl md:text-4xl font-semibold text-stone-900">
					{watch.title}
				</h1>
				<p
					class="mt-3 text-[13px] md:text-[15px] text-stone-400 font-body font-light max-w-md mx-auto leading-relaxed"
				>
					Ce direct a été annulé. Retrouvez les prochains directs et les rediffusions sur la page
					d'écoute.
				</p>
			</div>

			<div class="text-center">
				<a
					href="/live"
					class="inline-block border border-stone-200/60 bg-white/40 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.2em] font-body text-stone-600 transition-colors hover:border-missionnaire/30 hover:bg-missionnaire hover:text-white"
				>
					Aller à la page d'écoute
				</a>
			</div>
		{/if}

		<!-- Ornament -->
		<div class="mt-10 text-center">
			<p class="ornament-line text-stone-200 mb-6">
				<svg width="10" height="10" viewBox="0 0 14 14" fill="none"
					><path
						d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z"
						fill="currentColor"
					/></svg
				>
			</p>
			<p class="font-display text-lg italic text-stone-400 leading-relaxed">
				« Voici, je me tiens à la porte, et je frappe. »
			</p>
			<p
				class="text-[11px] font-bold uppercase tracking-[0.25em] text-missionnaire/60 mt-2 font-body"
			>
				— Apocalypse 3:20
			</p>
		</div>
	</div>
</section>
