<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

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

<svelte:head>
	<title>Directs précédents - Missionnaire Network</title>
	<meta name="description" content="Réécoutez les directs audio précédents de Missionnaire Network." />
	<link rel="canonical" href="https://missionnaire.net/live/archives" />
</svelte:head>

<section class="w-full py-14 md:py-20 px-6">
	<div class="max-w-3xl mx-auto">
		<!-- Header -->
		<div class="text-center mb-12">
			<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
				Archives
			</p>
			<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">
				Directs précédents
			</h1>
			<p class="mt-3 text-[15px] text-stone-400 font-body font-light max-w-md mx-auto leading-relaxed">
				Retrouvez les enregistrements des directs audio passés.
			</p>
		</div>

		<!-- Back to live -->
		<div class="mb-8 text-center">
			<a
				href="/live"
				class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-missionnaire/80 hover:text-missionnaire transition-colors"
			>
				← Retour au direct
			</a>
		</div>

		{#if data.recordings.length === 0}
			<div class="text-center py-16">
				<p class="font-display text-lg italic text-stone-400">
					Aucun enregistrement disponible pour le moment.
				</p>
			</div>
		{:else}
			<ul class="divide-y divide-stone-100 border border-stone-200/60 bg-white/40">
				{#each data.recordings as rec}
					<li>
						<a
							href="/live/archives/{rec.id}"
							class="flex items-center gap-4 px-5 py-5 transition-colors hover:bg-missionnaire/5 group"
						>
							<div class="flex h-12 w-12 shrink-0 items-center justify-center border border-stone-200/60 text-missionnaire/60 group-hover:border-missionnaire/30 group-hover:text-missionnaire transition-colors">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none" />
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-[15px] font-medium text-stone-700 group-hover:text-missionnaire transition-colors">
									{rec.title}
								</p>
								<p class="text-xs text-stone-400 mt-1 font-body">
									{formatDate(rec.started_at)} · {formatDuration(rec.duration_sec)}
								</p>
							</div>
							<span class="hidden sm:inline text-[11px] font-bold uppercase tracking-[0.15em] font-body text-stone-300 group-hover:text-missionnaire transition-colors">
								Écouter →
							</span>
						</a>
					</li>
				{/each}
			</ul>

			{#if totalPages > 1}
				<div class="mt-8 flex items-center justify-center gap-4 text-sm">
					{#if data.pageNumber > 1}
						<a href="?page={data.pageNumber - 1}" class="text-missionnaire hover:underline">← Précédent</a>
					{/if}
					<span class="text-stone-400">Page {data.pageNumber} / {totalPages}</span>
					{#if data.pageNumber < totalPages}
						<a href="?page={data.pageNumber + 1}" class="text-missionnaire hover:underline">Suivant →</a>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</section>
