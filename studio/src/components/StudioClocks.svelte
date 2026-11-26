<script lang="ts">
	import { onMount } from 'svelte';
	import { broadcast, manualRecording } from '../lib/broadcast.svelte';
	import { liveSession } from '../lib/live-session.svelte';
	import { recording } from '../lib/recording.svelte';

	let now = $state(Date.now());
	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(timer);
	});

	const elapsed = (startedAt: number | null) =>
		startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
	const duration = (seconds: number) => new Date(seconds * 1000).toISOString().slice(11, 19);
	const recordingStartedAt = $derived(manualRecording.localStartedAt ?? recording.startedAt);
	const programmeStartedAt = $derived(liveSession.activeStartedAt ?? broadcast.startedAt);
	const programmeLabel = $derived(
		liveSession.activeStartedAt ? 'LIVE' : broadcast.startedAt ? 'PREVIEW' : 'OFF AIR'
	);
</script>

<div
	class="ml-auto flex h-[60px] w-[330px] max-w-full shrink-0 overflow-hidden rounded-md border border-ink-700 bg-ink-950/70"
>
	<div class="flex min-w-0 flex-1 flex-col justify-center border-r border-ink-700 px-3">
		<span
			class="flex items-center gap-2 text-[12px] font-semibold tracking-[0.18em] {liveSession.activeStartedAt
				? 'text-danger'
				: broadcast.startedAt
					? 'text-warning'
					: 'text-muted'}"
		>
			<span
				class="h-1.5 w-1.5 rounded-full {liveSession.activeStartedAt
					? 'animate-pulse bg-red-500'
					: broadcast.startedAt
						? 'bg-amber-400'
						: 'bg-fg/20'}"
			></span>
			{programmeLabel}
		</span>
		<span class="font-mono text-[22px] leading-none tracking-tight tabular-nums text-fg">
			{duration(elapsed(programmeStartedAt))}
		</span>
	</div>
	<div class="grid w-[176px] max-w-[56%] grid-cols-2 divide-x divide-ink-700">
		<div class="flex flex-col items-center justify-center">
			<span class="text-[12px] font-semibold tracking-[0.16em] text-muted">LOCAL</span>
			<span class="font-mono text-[14px] text-fg/75">
				{new Date(now).toLocaleTimeString([], {
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit'
				})}
			</span>
		</div>
		<div class="flex flex-col items-center justify-center bg-red-500/[0.03]">
			<span
				class="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.16em] {recordingStartedAt
					? 'text-danger'
					: 'text-muted'}"
			>
				{#if recordingStartedAt}<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"
					></span>{/if}
				REC
			</span>
			<span class="font-mono text-[14px] {recordingStartedAt ? 'text-danger' : 'text-muted'}">
				{recordingStartedAt ? duration(elapsed(recordingStartedAt)) : '--:--:--'}
			</span>
		</div>
	</div>
</div>
