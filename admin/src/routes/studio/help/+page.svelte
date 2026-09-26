<script lang="ts">
	import { t, type TranslationKey } from '$lib/i18n';

	const guides: { title: TranslationKey; description: TranslationKey; file: string }[] = [
		{
			title: 'studioHelp.guide1Title',
			description: 'studioHelp.guide1Description',
			file: 'missionnaire-studio-guide-01-overview'
		},
		{
			title: 'studioHelp.guide2Title',
			description: 'studioHelp.guide2Description',
			file: 'missionnaire-studio-guide-02-scenes-sources'
		},
		{
			title: 'studioHelp.guide3Title',
			description: 'studioHelp.guide3Description',
			file: 'missionnaire-studio-guide-03-audio-lyrics'
		},
		{
			title: 'studioHelp.guide4Title',
			description: 'studioHelp.guide4Description',
			file: 'missionnaire-studio-guide-04-service-setup'
		},
		{
			title: 'studioHelp.guide5Title',
			description: 'studioHelp.guide5Description',
			file: 'missionnaire-studio-guide-05-going-live'
		},
		{
			title: 'studioHelp.guide6Title',
			description: 'studioHelp.guide6Description',
			file: 'missionnaire-studio-guide-06-pre-recorded-preview'
		}
	];
</script>

<svelte:head>
	<title>{$t('studioHelp.pageTitle')}</title>
</svelte:head>

<header class="mb-8 max-w-3xl">
	<h1 class="font-display text-3xl font-semibold text-stone-800 sm:text-4xl">
		{$t('studioHelp.title')}
	</h1>
	<p class="mt-3 max-w-2xl text-sm leading-6 text-stone-500">{$t('studioHelp.subtitle')}</p>
</header>

<aside class="mb-10 border-l-4 border-primary bg-white px-5 py-4" aria-labelledby="before-studio">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 id="before-studio" class="text-sm font-semibold text-stone-800">
				{$t('studioHelp.beforeTitle')}
			</h2>
			<p class="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
				{$t('studioHelp.beforeBody')}
			</p>
		</div>
		<a class="admin-btn-secondary shrink-0" href="/recordings">{$t('studioHelp.openLives')}</a>
	</div>
</aside>

<ol class="space-y-10" aria-label={$t('studioHelp.guideList')}>
	{#each guides as guide, index}
		<li class="grid gap-4 lg:grid-cols-[4rem_minmax(0,1fr)]">
			<div
				class="font-display text-4xl font-semibold leading-none text-stone-300"
				aria-hidden="true"
			>
				{String(index + 1).padStart(2, '0')}
			</div>
			<article class="min-w-0 border-t border-stone-200 pt-4">
				<div class="mb-4 max-w-3xl">
					<h2 class="font-display text-2xl font-semibold text-stone-800">{$t(guide.title)}</h2>
					<p class="mt-1 text-sm leading-6 text-stone-500">{$t(guide.description)}</p>
				</div>
				<video
					class="aspect-video w-full border border-stone-300 bg-stone-950 shadow-sm"
					controls
					preload="none"
					poster={`/studio-guides/${guide.file}.jpg`}
					aria-label={$t(guide.title)}
				>
					<source src={`/studio-guides/${guide.file}.mp4`} type="video/mp4" />
					<track
						kind="captions"
						src={`/studio-guides/${guide.file}.vtt`}
						srclang="en"
						label={$t('studioHelp.englishCaptions')}
						default
					/>
					{$t('studioHelp.videoUnsupported')}
				</video>
			</article>
		</li>
	{/each}
</ol>
