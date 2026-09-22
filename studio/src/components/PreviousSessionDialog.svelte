<script lang="ts">
	import { liveSession, type LiveSession } from '../lib/live-session.svelte';

	let { onnew, onreuse }: { onnew: () => void; onreuse: (session: LiveSession) => void } = $props();
	let selected = $state<LiveSession | null>(liveSession.previousSessions[0] ?? null);

	$effect(() => {
		if (!liveSession.previousSessions.some((session) => session._id === selected?._id)) {
			selected = liveSession.previousSessions[0] ?? null;
		}
	});
</script>

<div class="flex min-h-0 flex-col">
	<div class="space-y-4 p-5">
		<p class="max-w-xl text-[13px] leading-relaxed text-fg/75">
			Copy and reuse details from a recently completed stream, or create a stream with new settings.
		</p>

		{#if liveSession.previousSessions.length > 0}
			<div class="max-h-80 space-y-1 overflow-y-auto pr-1" aria-label="Previous streams">
				{#each liveSession.previousSessions as session (session._id)}
					<button
						type="button"
						aria-pressed={selected?._id === session._id}
						class="flex w-full items-center gap-3 border p-3 text-left transition-colors {selected?._id ===
						session._id
							? 'border-primary bg-primary/10'
							: 'border-ink-700 bg-ink-850/40 hover:border-ink-500'}"
						onclick={() => (selected = session)}
					>
						{#if session.thumbnail_url}
							<img class="h-14 w-24 shrink-0 object-cover" src={session.thumbnail_url} alt="" />
						{:else}
							<span
								class="flex h-14 w-24 shrink-0 items-center justify-center bg-ink-700 text-[12px] text-muted"
								>No image</span
							>
						{/if}
						<span class="min-w-0 flex-1">
							<strong class="block truncate text-[13px] text-fg/90">{session.title}</strong>
							<span class="mt-0.5 block text-[12px] text-muted">
								Streamed {new Date(session.live_ended_at ?? session.scheduled_at).toLocaleString()}
							</span>
							<span class="block truncate text-[12px] text-muted">
								{session.youtube_channel_title ?? 'Missionnaire stream'}
							</span>
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<p class="border border-ink-700 bg-ink-850/40 px-4 py-8 text-center text-[12px] text-muted">
				No completed streams are available yet.
			</p>
		{/if}
	</div>

	<footer class="flex justify-end gap-2 border-t border-ink-700 px-5 py-3">
		<button type="button" class="studio-chip" onclick={onnew}>Create new</button>
		<button
			type="button"
			class="studio-btn-primary"
			disabled={!selected}
			onclick={() => selected && onreuse(selected)}>Reuse settings</button
		>
	</footer>
</div>
