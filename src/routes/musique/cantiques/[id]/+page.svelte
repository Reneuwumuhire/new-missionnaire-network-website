<script lang="ts">
	import { t } from '../../../../i18n';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import Musicnote from 'iconsax-svelte/Musicnote.svelte';

	let { data } = $props();
</script>

<div class="mx-auto w-full max-w-6xl px-2 pb-10 md:px-6">
	<Breadcrumbs items={[{ label: $t('nav.musique'), href: '/musique' }, { label: data.title }]} />
	<article class="mx-auto w-full max-w-4xl">
		<header class="border border-stone-200 bg-white/60 p-4 sm:p-6 md:p-8">
			<div class="flex items-start gap-3 sm:gap-4">
				<span
					aria-hidden="true"
					class="grid size-10 shrink-0 place-items-center border border-stone-200 bg-cream text-missionnaire-Yellow-700 sm:size-12"
				>
					<Musicnote size={22} color="currentColor" />
				</span>
				<div class="min-w-0">
					<h1
						class="break-words font-display text-3xl font-semibold leading-tight text-stone-900 sm:text-4xl"
					>
						{data.title}
					</h1>
					{#if data.reference || data.artist}
						<p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
							{#if data.reference}<span>{data.reference}</span>{/if}
							{#if data.artist}<span
									class:border-l={data.reference}
									class:border-stone-300={data.reference}
									class:pl-3={data.reference}>{data.artist}</span
								>{/if}
						</p>
					{/if}
				</div>
			</div>
			<div
				class="mt-5 flex flex-col gap-2 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between"
			>
				<audio
					controls
					preload="none"
					src={data.audioUrl}
					class="w-full max-w-md"
					aria-label={data.title}
				></audio>
				{#if data.lyrics.length}
					<a
						href="#hymn-lyrics"
						class="inline-flex min-h-11 items-center self-start text-sm font-semibold text-missionnaire-Yellow-700 underline decoration-stone-300 underline-offset-4 hover:decoration-missionnaire-Yellow-700 sm:self-auto"
					>
						{$t('player.lyrics')}
					</a>
				{/if}
			</div>
		</header>
		{#if data.lyrics.length}
			<section
				aria-labelledby="hymn-lyrics"
				class="mt-5 border border-stone-200 border-l-[3px] border-l-missionnaire bg-cream p-4 sm:mt-6 sm:p-6 md:p-8"
			>
				<h2
					id="hymn-lyrics"
					class="mb-4 scroll-mt-24 border-b border-stone-200 pb-3 font-display text-2xl font-semibold text-stone-900 sm:text-3xl"
				>
					{$t('player.lyrics')}
				</h2>
				<div class="max-w-prose space-y-1 text-base leading-relaxed text-stone-800">
					{#each data.lyrics as line}
						<p
							class={line.kind === 'heading'
								? 'pt-3 font-semibold text-stone-900'
								: 'whitespace-pre-line'}
						>
							{line.text}
						</p>
					{/each}
				</div>
			</section>
		{/if}
	</article>
</div>
