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
	<div class="max-w-5xl mx-auto">
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
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
				{#each data.recordings as rec}
					<a
						href="/live/archives/{rec.id}"
						class="group block border border-stone-200/60 bg-white/40 transition-all duration-300 hover:border-missionnaire/40 hover:shadow-sm overflow-hidden"
					>
						<!-- Thumbnail -->
						<div class="relative aspect-video w-full overflow-hidden bg-stone-100">
							{#if rec.thumbnail_url}
								<img
									src={rec.thumbnail_url}
									alt=""
									width="640"
									height="360"
									loading="lazy"
									decoding="async"
									class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
								/>
							{:else}
								<div class="default-thumbnail absolute inset-0 flex flex-col items-center justify-center gap-1.5">
									<picture>
										<source srcset="/icons/logo.webp" type="image/webp" />
										<img
											src="/icons/logo.png"
											alt=""
											class="h-7 w-auto opacity-90"
											width="150"
											height="64"
											loading="lazy"
										/>
									</picture>
									<span class="text-[9px] font-bold uppercase tracking-[0.25em] text-missionnaire/70 font-body">
										Archive
									</span>
									<svg class="absolute top-2 right-2 h-3 w-3 text-missionnaire/30" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
										<path d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z" />
									</svg>
								</div>
							{/if}
							<!-- Play overlay on hover -->
							<div class="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/30 transition-colors duration-300 flex items-center justify-center">
								<div class="h-10 w-10 rounded-full bg-white/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-90 group-hover:scale-100 shadow-lg">
									<svg width="12" height="14" viewBox="0 0 14 16" fill="none" aria-hidden="true">
										<path d="M2 1.5L12.5 8L2 14.5V1.5Z" fill="#1c1917" stroke="#1c1917" stroke-width="1.5" stroke-linejoin="round"/>
									</svg>
								</div>
							</div>
						</div>

						<!-- Card body -->
						<div class="p-4">
							<p class="font-display text-[15px] font-medium text-stone-800 group-hover:text-missionnaire transition-colors line-clamp-2 leading-snug">
								{rec.title}
							</p>
							<p class="mt-1.5 text-[11px] text-stone-400 font-body">
								{formatDate(rec.started_at)} · {formatDuration(rec.duration_sec)}
							</p>
						</div>
					</a>
				{/each}
			</div>

			{#if totalPages > 1}
				<div class="mt-10 flex items-center justify-center gap-4 text-sm">
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

<style>
	.default-thumbnail {
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 136, 12, 0.08), transparent 60%),
			linear-gradient(135deg, #FAF6F1 0%, #F1EAE0 100%);
	}
</style>
