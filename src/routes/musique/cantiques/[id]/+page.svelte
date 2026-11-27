<script lang="ts">
	import { t } from '../../../../i18n';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	let { data } = $props();
</script>

<div class="mx-auto w-full max-w-4xl px-3 pb-6 sm:px-6">
	<Breadcrumbs items={[{ label: $t('nav.musique'), href: '/musique' }, { label: data.title }]} />
	<article class="border border-stone-200 bg-white/60 p-5 sm:p-8">
		<h1 class="font-display text-3xl font-semibold text-stone-900 sm:text-4xl">{data.title}</h1>
		{#if data.reference || data.artist}
			<p class="mt-2 text-sm text-stone-600">
				{[data.reference, data.artist].filter(Boolean).join(' · ')}
			</p>
		{/if}
		<audio
			controls
			preload="none"
			src={data.audioUrl}
			class="mt-5 w-full max-w-md"
			aria-label={data.title}
		></audio>
		{#if data.lyrics.length}
			<section aria-labelledby="hymn-lyrics" class="mt-7 border-t border-stone-200 pt-5">
				<h2 id="hymn-lyrics" class="mb-3 font-display text-2xl font-semibold">
					{$t('player.lyrics')}
				</h2>
				{#each data.lyrics as line}
					<p
						class={line.kind === 'heading'
							? 'mt-3 font-semibold'
							: 'whitespace-pre-line leading-relaxed'}
					>
						{line.text}
					</p>
				{/each}
			</section>
		{/if}
	</article>
</div>
