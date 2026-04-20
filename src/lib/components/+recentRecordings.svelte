<script lang="ts">
	import type { PublishedRecording } from '$lib/server/recordings';

	export let recordings: PublishedRecording[] = [];

	// Legacy thumbnails uploaded before the ACL fix return 403. Track failed
	// IDs so the default logo fallback replaces the broken-image icon.
	let failedThumbs = new Set<string>();
	function markThumbFailed(id: string) {
		if (failedThumbs.has(id)) return;
		failedThumbs = new Set(failedThumbs).add(id);
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

{#if recordings.length > 0}
	<section class="mt-12">
		<div class="flex items-end justify-between mb-5">
			<div>
				<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-1 font-body">
					Rediffusions
				</p>
				<h2 class="font-display text-xl font-semibold text-stone-900">Directs précédents</h2>
			</div>
			<a href="/live/rediffusions" class="section-cta">
				<span class="section-cta-label">Voir tout</span>
				<span class="section-cta-arrow" aria-hidden="true">→</span>
			</a>
		</div>

		<ul class="divide-y divide-stone-100 border border-stone-200/60 bg-white/40">
			{#each recordings as rec}
				<li>
					<a
						href="/live/rediffusions/{rec.id}"
						class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-missionnaire/5 group"
					>
						<div class="relative h-14 w-20 shrink-0 overflow-hidden border border-stone-200/60 bg-stone-100">
							{#if rec.thumbnail_url && !failedThumbs.has(rec.id)}
								<img
									src={rec.thumbnail_url}
									alt=""
									on:error={() => markThumbFailed(rec.id)}
									class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
									width="160"
									height="90"
									loading="lazy"
									decoding="async"
								/>
							{:else}
								<div class="recent-default-thumb absolute inset-0 flex items-center justify-center">
									<picture>
										<source srcset="/icons/logo.webp" type="image/webp" />
										<img src="/icons/logo.png" alt="" class="h-4 w-auto opacity-70" width="150" height="64" loading="lazy" />
									</picture>
								</div>
							{/if}
							<div class="absolute inset-0 flex items-center justify-center bg-stone-900/0 group-hover:bg-stone-900/30 transition-colors duration-300">
								<svg width="10" height="12" viewBox="0 0 14 16" fill="none" class="opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
									<path d="M2 1.5L12.5 8L2 14.5V1.5Z" fill="white" />
								</svg>
							</div>
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

<style>
	.recent-default-thumb {
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 136, 12, 0.08), transparent 60%),
			linear-gradient(135deg, #FAF6F1 0%, #F1EAE0 100%);
	}
</style>
