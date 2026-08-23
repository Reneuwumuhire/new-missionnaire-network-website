<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import {
		connectWithAdmin,
		createQuickTest,
		liveSession,
		refreshSessions,
		selectSession
	} from '../lib/live-session.svelte';

	let { onchoose, onnew }: { onchoose: () => void; onnew: () => void } = $props();
	onMount(() => {
		if (liveSession.pairingCode) void refreshSessions();
	});
</script>

<div class="space-y-3 p-4">
	<p class="text-[12px] text-fg/60">
		Choose an upcoming public link, or create a new service. Past sessions are managed in admin.
	</p>
	{#if !liveSession.operatorName}
		<button class="studio-chip w-full" onclick={() => void connectWithAdmin()}
			>Continue with admin</button
		>
		{#if liveSession.pairingCode}<button
				class="studio-chip w-full"
				onclick={() => void refreshSessions()}>I approved it — refresh</button
			>{/if}
	{/if}
	{#if liveSession.operatorName}
		<div class="grid grid-cols-2 gap-2">
			<button class="studio-chip" onclick={onnew}>New public session</button>
			<button
				class="studio-chip border-primary/50 text-primary"
				onclick={async () => {
					const link = await createQuickTest();
					if (link) {
						await invoke('open_url', { url: link });
						onchoose();
					}
				}}>Quick private test</button
			>
		</div>
		<p class="text-[10px] leading-relaxed text-fg/35">
			Uses the admin default information. The unlisted link is only opened here and never notifies
			subscribers.
		</p>
	{/if}
	{#if liveSession.sessions.length > 0}
		<div class="space-y-1">
			{#each liveSession.sessions as session (session._id)}
				<button
					class="flex w-full items-center justify-between border px-3 py-3 text-left text-[12px] transition-colors {liveSession.selectedId ===
					session._id
						? 'border-primary bg-primary/10'
						: 'border-ink-700 hover:border-ink-500'}"
					onclick={async () => {
						await selectSession(session._id);
						onchoose();
					}}
				>
					<span class="min-w-0"
						><strong class="block truncate text-fg/90">{session.title}</strong><span
							class="text-[10px] text-fg/45">{new Date(session.scheduled_at).toLocaleString()}</span
						></span
					>
					<span class="ml-3 shrink-0 font-mono text-[10px] text-primary">/live/{session.slug}</span>
				</button>
			{/each}
		</div>
	{:else if !liveSession.error}
		<p class="py-6 text-center text-[12px] text-fg/40">No upcoming live session found.</p>
	{/if}
	{#if liveSession.error}<p class="text-[12px] text-red-400">{liveSession.error}</p>{/if}
</div>
