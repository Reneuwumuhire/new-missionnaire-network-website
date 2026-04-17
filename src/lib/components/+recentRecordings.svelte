<script lang="ts">
	import type { PublishedRecording } from '$lib/server/recordings';

	export let recordings: PublishedRecording[] = [];

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

{#if recordings.length > 0}
	<section class="mt-12">
		<div class="flex items-end justify-between mb-5">
			<div>
				<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-1 font-body">
					Archives
				</p>
				<h2 class="font-display text-xl font-semibold text-stone-900">Directs précédents</h2>
			</div>
			<a
				href="/live/archives"
				class="text-[11px] font-bold uppercase tracking-[0.15em] font-body text-missionnaire/80 hover:text-missionnaire transition-colors"
			>
				Voir tout →
			</a>
		</div>

		<ul class="divide-y divide-stone-100 border border-stone-200/60 bg-white/40">
			{#each recordings as rec}
				<li>
					<a
						href="/live/archives/{rec.id}"
						class="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-missionnaire/5 group"
					>
						<div class="flex h-10 w-10 shrink-0 items-center justify-center border border-stone-200/60 text-missionnaire/60 group-hover:border-missionnaire/30 group-hover:text-missionnaire transition-colors">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none" />
							</svg>
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-stone-700 group-hover:text-missionnaire transition-colors">
								{rec.title}
							</p>
							<p class="text-[11px] text-stone-400 mt-0.5 font-body">
								{formatDate(rec.started_at)} · {formatDuration(rec.duration_sec)}
							</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
