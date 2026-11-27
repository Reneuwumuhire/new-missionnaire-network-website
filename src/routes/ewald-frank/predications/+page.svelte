<script lang="ts">
	import { t } from '../../../i18n';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';

	let { data } = $props();
	const linkClass =
		'font-semibold text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-missionnaire';
</script>

<div class="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-12">
	<Breadcrumbs
		items={[{ label: 'Ewald Frank', href: '/ewald-frank' }, { label: $t('nav.predications') }]}
	/>
	<h1 class="font-display text-4xl font-semibold leading-tight text-stone-900 sm:text-5xl">
		{$t('ewald.sermons')}
	</h1>
	<p class="mt-3 max-w-2xl leading-relaxed text-stone-600">{$t('ewald.sermonsIntro')}</p>
	<nav aria-label={$t('ewald.resources')} class="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
		<a class={linkClass} href="/videos?filter=Ewald%20Frank">{$t('nav.videos')}</a>
		<a class={linkClass} href="/transcriptions?search=Ewald%20Frank">{$t('nav.transcriptions')}</a>
		<a class={linkClass} href="/literature?author=Ewald%20Frank">{$t('ewald.books')}</a>
		<a class={linkClass} href="/ewald-frank">{$t('nav.sub.frankAbout')}</a>
	</nav>

	<div class="mt-8 grid gap-6 md:grid-cols-2">
		{#if data.videos.length}
			<section aria-labelledby="frank-videos" class="border border-stone-200 bg-white/60 p-5">
				<h2 id="frank-videos" class="font-display text-2xl font-semibold">{$t('nav.videos')}</h2>
				<ul class="mt-2 divide-y divide-stone-200 text-sm leading-relaxed">
					{#each data.videos as video (video.id)}
						<li class="py-3">
							<a class={linkClass} href={`/videos?v=${encodeURIComponent(video.id)}`}>
								{video.title}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if data.transcripts.length}
			<section aria-labelledby="frank-transcripts" class="border border-stone-200 bg-white/60 p-5">
				<h2 id="frank-transcripts" class="font-display text-2xl font-semibold">
					{$t('nav.transcriptions')}
				</h2>
				<ul class="mt-2 divide-y divide-stone-200 text-sm leading-relaxed">
					{#each data.transcripts as transcript (transcript.id)}
						<li class="py-3">
							<a class={linkClass} href={`/transcriptions/${transcript.id}`}>{transcript.title}</a>
							{#if transcript.recordingDetails}
								<p class="mt-1 text-xs text-stone-600">{transcript.recordingDetails}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
</div>
