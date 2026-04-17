<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: rec = data.recording;

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
	<title>{rec.title} - Missionnaire Network</title>
	<meta name="description" content="Réécoutez le direct audio du {formatDate(rec.started_at)}." />
	<link rel="canonical" href="https://missionnaire.net/live/archives/{rec.id}" />
</svelte:head>

<section class="w-full py-14 md:py-20 px-6">
	<div class="max-w-2xl mx-auto">
		<div class="mb-8">
			<a
				href="/live/archives"
				class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-missionnaire/80 hover:text-missionnaire transition-colors"
			>
				← Tous les directs
			</a>
		</div>

		<div class="text-center mb-10">
			<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
				Direct précédent
			</p>
			<h1 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">{rec.title}</h1>
			<p class="mt-3 text-sm text-stone-400 font-body">
				{formatDate(rec.started_at)} · {formatDuration(rec.duration_sec)}
			</p>
		</div>

		<div class="border border-stone-200/60 bg-white/40 p-6">
			<audio controls preload="metadata" class="w-full" src={rec.s3_url}>
				Votre navigateur ne prend pas en charge l'audio HTML5.
			</audio>
		</div>

		<div class="mt-6 text-center">
			<a
				href={rec.s3_url}
				class="inline-flex items-center gap-2 border border-stone-200/60 bg-white/40 px-5 py-3 text-[13px] font-semibold text-stone-700 hover:border-missionnaire/30 hover:text-missionnaire transition-colors"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4" />
				</svg>
				Télécharger
			</a>
		</div>
	</div>
</section>
