<script lang="ts">
	import type { PageData } from './$types';
	import type { PublishedRecording } from '$lib/server/recordings';

	export let data: PageData;

	$: totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

	let expandedThumb: PublishedRecording | null = null;
	// Thumbnails can 403 if a past upload was private. Track failed IDs so the
	// default logo fallback replaces the broken-image icon.
	let failedThumbs = new Set<string>();
	function markThumbFailed(id: string | undefined) {
		if (!id || failedThumbs.has(id)) return;
		failedThumbs = new Set(failedThumbs).add(id);
	}

	function openThumb(rec: PublishedRecording, event: MouseEvent) {
		if (!rec.thumbnail_url || failedThumbs.has(rec.id)) return;
		// Prevent the row-wrapping <a> from navigating to detail page.
		event.preventDefault();
		event.stopPropagation();
		expandedThumb = rec;
	}

	function closeThumb() {
		expandedThumb = null;
	}

	function onLightboxKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeThumb();
	}

	function onLightboxBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeThumb();
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

<svelte:head>
	<title>Directs précédents - Missionnaire Network</title>
	<meta name="description" content="Réécoutez les directs audio précédents de Missionnaire Network." />
	<link rel="canonical" href="https://missionnaire.net/live/rediffusions" />
</svelte:head>

<svelte:window on:keydown={onLightboxKeydown} />

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
						<div class="group relative flex items-center gap-4 px-4 py-4 transition-colors hover:bg-missionnaire/5">
							<!-- Thumbnail — clickable to expand, separate from row nav -->
							<button
								type="button"
								on:click={(e) => openThumb(rec, e)}
								aria-label={rec.thumbnail_url ? 'Agrandir la vignette' : 'Vignette par défaut'}
								class="relative h-14 w-24 sm:h-16 sm:w-28 shrink-0 overflow-hidden border border-stone-200/60 bg-stone-100 {rec.thumbnail_url ? 'cursor-zoom-in' : 'cursor-default'} focus:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
							>
								{#if rec.thumbnail_url && !failedThumbs.has(rec.id)}
									<img
										src={rec.thumbnail_url}
										alt=""
										on:error={() => markThumbFailed(rec.id)}
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										width="192"
										height="108"
										loading="lazy"
										decoding="async"
									/>
								{:else}
									<div class="default-thumbnail absolute inset-0 flex items-center justify-center">
										<picture>
											<source srcset="/icons/logo.webp" type="image/webp" />
											<img
												src="/icons/logo.png"
												alt=""
												class="h-4 w-auto opacity-80"
												width="150"
												height="64"
												loading="lazy"
											/>
										</picture>
									</div>
								{/if}
							</button>

							<!-- Title + meta — row navigation -->
							<a
								href="/live/rediffusions/{rec.id}"
								class="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40 rounded"
							>
								<p class="font-display text-[15px] sm:text-base font-medium text-stone-800 group-hover:text-missionnaire transition-colors leading-snug line-clamp-2">
									{rec.title}
								</p>
								<p class="mt-1 text-xs text-stone-400 font-body">
									{formatDate(rec.started_at)} · {formatDuration(rec.duration_sec)}
								</p>
							</a>

							<!-- Listen affordance (desktop only) -->
							<a
								href="/live/rediffusions/{rec.id}"
								aria-hidden="true"
								tabindex="-1"
								class="hidden sm:inline-flex shrink-0 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-stone-300 group-hover:text-missionnaire transition-colors"
							>
								Écouter →
							</a>
						</div>
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

{#if expandedThumb && expandedThumb.thumbnail_url && !failedThumbs.has(expandedThumb.id)}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-lightbox-in"
		on:click={onLightboxBackdropClick}
		on:keydown={onLightboxKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Vignette du direct"
		tabindex="-1"
	>
		<button
			type="button"
			on:click={closeThumb}
			aria-label="Fermer"
			class="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M6 6l12 12M6 18L18 6" />
			</svg>
		</button>
		<img
			src={expandedThumb.thumbnail_url}
			alt={expandedThumb.title}
			on:error={() => {
				markThumbFailed(expandedThumb!.id);
				closeThumb();
			}}
			class="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl"
		/>
	</div>
{/if}

<style>
	.default-thumbnail {
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 136, 12, 0.08), transparent 60%),
			linear-gradient(135deg, #FAF6F1 0%, #F1EAE0 100%);
	}
	.animate-lightbox-in {
		animation: lightbox-fade 0.18s ease-out;
	}
	@keyframes lightbox-fade {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
