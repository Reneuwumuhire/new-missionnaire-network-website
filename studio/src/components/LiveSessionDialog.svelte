<script lang="ts">
	import { onMount } from 'svelte';
	import { connectWithAdmin, createSession, liveSession, refreshSessions } from '../lib/live-session.svelte';

	let { onchoose }: { onchoose: () => void } = $props();
	let title = $state('');
	let scheduledAt = $state('');
	onMount(() => { if (liveSession.pairingCode) void refreshSessions(); });
</script>

<div class="space-y-3 p-4">
	<p class="text-[12px] text-fg/60">Choose a public link, or create a new service. Recent sessions remain available for one month.</p>
	<button class="studio-chip w-full" onclick={() => void connectWithAdmin()}>Continue with admin</button>
	{#if liveSession.pairingCode}<button class="studio-chip w-full" onclick={() => void refreshSessions()}>I approved it — refresh</button>{/if}
	{#if liveSession.operatorName}
		<div class="border border-ink-700 p-3">
			<p class="mb-2 text-[10px] uppercase tracking-wider text-fg/40">New public session</p>
			<div class="flex gap-2"><input class="studio-input min-w-0 flex-1" bind:value={title} placeholder="Sunday morning service" /><button class="studio-chip" onclick={async () => { if (await createSession(title, scheduledAt ? new Date(scheduledAt).toISOString() : undefined)) onchoose(); }}>Create</button></div>
			<input class="studio-input mt-2 w-full" type="datetime-local" bind:value={scheduledAt} />
		</div>
	{/if}
	{#if liveSession.sessions.length > 0}
		<div class="space-y-1">
			{#each liveSession.sessions as session (session._id)}
				<button class="flex w-full items-center justify-between border px-3 py-3 text-left text-[12px] transition-colors {liveSession.selectedId === session._id ? 'border-primary bg-primary/10' : 'border-ink-700 hover:border-ink-500'}" onclick={() => { liveSession.selectedId = session._id; onchoose(); }}>
					<span class="min-w-0"><strong class="block truncate text-fg/90">{session.title}</strong><span class="text-[10px] text-fg/45">{new Date(session.scheduled_at).toLocaleString()}</span></span>
					<span class="ml-3 shrink-0 font-mono text-[10px] text-primary">/live/{session.slug}</span>
				</button>
			{/each}
		</div>
	{:else if !liveSession.error}
		<p class="py-6 text-center text-[12px] text-fg/40">No scheduled live session found.</p>
	{/if}
	{#if liveSession.error}<p class="text-[12px] text-red-400">{liveSession.error}</p>{/if}
</div>
