<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '../../../../i18n';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import HymnAppDownload from '$lib/components/HymnAppDownload.svelte';
	import { basePlaylist, currentIndex, isPlaying, playlist, selectAudio } from '$lib/stores/global';
	import { addToRecentlyPlayed } from '$lib/stores/musicHistory';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import { formatTime } from '../../../../utils/FormatTime';
	import Book1 from 'iconsax-svelte/Book1.svelte';
	import Musicnote from 'iconsax-svelte/Musicnote.svelte';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsPauseCircleFill from 'svelte-icons-pack/bs/BsPauseCircleFill';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';

	let { data } = $props();
	let ready = $state(false);
	const selected = $derived(
		$selectAudio && 's3_url' in $selectAudio && $selectAudio.s3_url === data.song.s3_url
	);
	const playing = $derived(selected && $isPlaying);
	const playClass =
		'inline-flex min-h-11 items-center justify-center gap-2 border border-stone-900 bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-missionnaire-Yellow-700';

	onMount(() => {
		ready = true;
	});

	function togglePlayback() {
		if (selected) {
			dispatchAudioPlayerAction('toggle');
			return;
		}
		basePlaylist.set([data.song]);
		playlist.set([data.song]);
		currentIndex.set(0);
		selectAudio.set(data.song);
		isPlaying.set(true);
		addToRecentlyPlayed(data.song);
	}
</script>

<div class="mx-auto w-full max-w-4xl px-2 pb-10 md:px-4">
	<Breadcrumbs items={[{ label: $t('nav.musique'), href: '/musique' }, { label: data.title }]} />
	<article>
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
					<p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
						{#if data.reference}<span>{data.reference}</span>{/if}
						{#if data.song.artist}<span>{data.song.artist}</span>{/if}
						{#if data.song.duration && data.song.duration > 0}
							<span class="tabular-nums">{formatTime(data.song.duration)}</span>
						{/if}
					</p>
				</div>
			</div>
			<div class="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4">
				{#if ready}
					<button type="button" class={playClass} onclick={togglePlayback}>
						<span aria-hidden="true">
							<Icon src={playing ? BsPauseCircleFill : BsPlayCircleFill} size="18" />
						</span>
						{$t(playing ? 'player.pause' : 'music.listenHymn')}
					</button>
				{:else}
					<a href={data.song.s3_url} class={playClass}>
						<span aria-hidden="true"><Icon src={BsPlayCircleFill} size="18" /></span>
						{$t('music.listenHymn')}
					</a>
				{/if}
				{#if data.lyrics.length}
					<a
						href="#hymn-lyrics"
						class="inline-flex min-h-11 items-center gap-2 border border-stone-300 bg-cream px-3 py-2 text-sm font-semibold text-stone-800 hover:border-missionnaire-Yellow-600 hover:bg-missionnaire-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-missionnaire-Yellow-700"
					>
						<span aria-hidden="true" class="text-missionnaire-Yellow-700"
							><Book1 size={18} color="currentColor" /></span
						>
						{$t('player.lyrics')}
					</a>
				{/if}
			</div>
		</header>

		{#if data.lyrics.length}
			<section
				aria-labelledby="hymn-lyrics"
				class="mt-5 border border-stone-200 border-l-[3px] border-l-missionnaire bg-cream px-4 py-5 sm:mt-6 sm:px-6 md:px-8"
			>
				<h2
					id="hymn-lyrics"
					class="scroll-mt-24 border-b border-stone-200 pb-3 font-display text-2xl font-semibold text-stone-900 sm:text-3xl"
				>
					{$t('player.lyrics')}
				</h2>
				<div class="divide-y divide-stone-200/80">
					{#each data.lyrics as block}
						{#if block.heading}
							<h3 class="pt-4 font-display text-xl font-semibold text-stone-900">
								{block.heading}
							</h3>
						{:else}
							<div class="flex items-start gap-3 py-4 sm:gap-4 sm:py-5">
								{#if block.number}
									<span
										class="grid size-7 shrink-0 place-items-center border border-stone-200 bg-white/60 text-xs font-semibold tabular-nums text-missionnaire-Yellow-700"
										>{block.number}</span
									>
								{/if}
								<div
									class="min-w-0 max-w-prose flex-1 space-y-1.5 text-base leading-relaxed text-stone-800"
									class:text-missionnaire-Yellow-800={block.refrain}
								>
									{#each block.lines as line}
										{#each line as part}
											{#if part.repeat}
												<p class="my-2 border-l-2 border-missionnaire bg-missionnaire-50 px-3 py-2">
													<span class="whitespace-pre-line">{part.text}</span>
													<span
														aria-hidden="true"
														class="ml-1.5 inline-block whitespace-nowrap border border-missionnaire-100 bg-white/70 px-1.5 text-xs font-semibold text-missionnaire-Yellow-800"
														>×{part.repeat}</span
													>
													<span class="sr-only"
														>{$t('music.repeatTimes', { count: part.repeat })}</span
													>
												</p>
											{:else}
												<p class="whitespace-pre-line">{part.text}</p>
											{/if}
										{/each}
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}
	</article>
	<div class="mt-5 sm:mt-6"><HymnAppDownload /></div>
</div>
