<script lang="ts">
	import { t } from '../../../i18n';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import ArrowRight2 from 'iconsax-svelte/ArrowRight2.svelte';
	import Book1 from 'iconsax-svelte/Book1.svelte';
	import DocumentText from 'iconsax-svelte/DocumentText.svelte';
	import PlayCircle from 'iconsax-svelte/PlayCircle.svelte';

	let { data } = $props();
	const resources = [
		{ href: '/videos?filter=Ewald%20Frank', label: 'nav.videos', icon: PlayCircle },
		{
			href: '/transcriptions?search=Ewald%20Frank',
			label: 'nav.transcriptions',
			icon: DocumentText
		},
		{ href: '/literature?author=Ewald%20Frank', label: 'ewald.books', icon: Book1 }
	] as const;
	const resourceLink =
		'group flex min-h-14 items-center gap-3 border border-stone-300 bg-cream px-4 py-3 text-sm font-semibold text-stone-800 hover:border-missionnaire-Yellow-600 hover:bg-missionnaire-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-missionnaire-Yellow-700';
	const rowLink =
		'group flex min-h-14 items-center gap-3 px-3 py-3 text-sm font-semibold leading-snug text-stone-800 hover:bg-missionnaire-50 hover:text-missionnaire-Yellow-700 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-missionnaire-Yellow-700 sm:px-4';
</script>

<header class="overflow-hidden border-b border-stone-800 bg-stone-900">
	<div
		class="mx-auto grid max-w-7xl items-center gap-4 px-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] md:gap-8"
	>
		<div class="py-6 md:py-10">
			<h1 class="font-display text-3xl font-semibold leading-tight text-white md:text-5xl">
				{$t('ewald.sermons')}
			</h1>
			<p class="mt-2 max-w-xl text-sm leading-relaxed text-stone-300 md:mt-3 md:text-base">
				{$t('ewald.sermonsIntro')}
			</p>
		</div>
		<div class="relative hidden self-stretch md:block">
			<img
				src="/img/ewald_frank_page_header-768.webp"
				alt=""
				width="768"
				height="490"
				class="absolute inset-0 h-full w-full object-cover object-[center_38%]"
			/>
			<div
				aria-hidden="true"
				class="absolute inset-0 bg-gradient-to-r from-stone-900 via-transparent to-transparent"
			></div>
		</div>
	</div>
</header>

<div class="mx-auto w-full max-w-6xl px-4 pt-4 pb-12 sm:px-6 md:pt-8 md:pb-16">
	<Breadcrumbs
		items={[{ label: 'Ewald Frank', href: '/ewald-frank' }, { label: $t('nav.predications') }]}
	/>

	<nav aria-label={$t('ewald.resources')} class="grid gap-2 sm:grid-cols-3 sm:gap-3">
		{#each resources as resource (resource.href)}
			<a class={resourceLink} href={resource.href}>
				<span aria-hidden="true" class="shrink-0 text-missionnaire-Yellow-700">
					<resource.icon size={22} color="currentColor" />
				</span>
				<span class="min-w-0 flex-1">{$t(resource.label)}</span>
				<span
					aria-hidden="true"
					class="shrink-0 text-stone-500 group-hover:text-missionnaire-Yellow-700"
				>
					<ArrowRight2 size={16} color="currentColor" />
				</span>
			</a>
		{/each}
	</nav>

	<div class="mt-8 grid items-start gap-8 lg:grid-cols-2 lg:gap-6">
		{#if data.videos.length}
			<section aria-labelledby="frank-videos">
				<h2
					id="frank-videos"
					class="mb-3 font-display text-2xl font-semibold text-stone-900 sm:text-3xl"
				>
					{$t('nav.videos')}
				</h2>
				<ul class="divide-y divide-stone-200 border border-stone-200 bg-white/60">
					{#each data.videos as video (video.id)}
						<li>
							<a class={rowLink} href={`/videos?v=${encodeURIComponent(video.id)}`}>
								<span
									aria-hidden="true"
									class="relative grid aspect-video w-20 shrink-0 place-items-center overflow-hidden bg-cream-dark text-missionnaire-Yellow-700 sm:w-[6.25rem]"
								>
									<PlayCircle size={22} color="currentColor" />
									{#if video.thumbnail}
										<img
											src={video.thumbnail}
											alt=""
											width="160"
											height="90"
											loading="lazy"
											decoding="async"
											onerror={(event) => (event.currentTarget.hidden = true)}
											class="absolute inset-0 h-full w-full object-cover"
										/>
									{/if}
								</span>
								<span class="min-w-0 flex-1 break-words">{video.title}</span>
								<span aria-hidden="true" class="shrink-0 text-missionnaire-Yellow-700"
									><ArrowRight2 size={16} color="currentColor" /></span
								>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#if data.transcripts.length}
			<section aria-labelledby="frank-transcripts">
				<h2
					id="frank-transcripts"
					class="mb-3 font-display text-2xl font-semibold text-stone-900 sm:text-3xl"
				>
					{$t('nav.transcriptions')}
				</h2>
				<ul class="divide-y divide-stone-200 border border-stone-200 bg-white/60">
					{#each data.transcripts as transcript (transcript.id)}
						<li>
							<a class={rowLink} href={`/transcriptions/${transcript.id}`}>
								<span
									aria-hidden="true"
									class="grid size-10 shrink-0 place-items-center border border-stone-200 bg-cream text-missionnaire-Yellow-700"
								>
									<DocumentText size={20} color="currentColor" />
								</span>
								<span class="min-w-0 flex-1 break-words">
									{transcript.title}
									{#if transcript.recordingDetails}
										<span class="mt-1 block text-xs font-normal text-stone-600"
											>{transcript.recordingDetails}</span
										>
									{/if}
								</span>
								<span aria-hidden="true" class="shrink-0 text-missionnaire-Yellow-700"
									><ArrowRight2 size={16} color="currentColor" /></span
								>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
</div>
