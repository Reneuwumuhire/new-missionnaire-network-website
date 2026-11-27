<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '../../../../i18n';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import HymnAppDownload from '$lib/components/HymnAppDownload.svelte';
	import {
		audioPlayback,
		basePlaylist,
		currentIndex,
		isPlaying,
		playlist,
		selectAudio,
		visibleInlineAudioTrack
	} from '$lib/stores/global';
	import { addToRecentlyPlayed } from '$lib/stores/musicHistory';
	import {
		dispatchAudioPlayerAction,
		dispatchAudioPlayerSeek
	} from '$lib/utils/audioPlayerControls';
	import { encodeUrlPath } from '../../../../utils/audioPlayback';
	import { formatTime } from '../../../../utils/FormatTime';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsPauseFill from 'svelte-icons-pack/bs/BsPauseFill';
	import BsPlayFill from 'svelte-icons-pack/bs/BsPlayFill';

	let { data } = $props();
	let ready = $state(false);
	let controls: HTMLDivElement | undefined = $state();
	let controlsVisible = $state(false);
	const selected = $derived(
		$selectAudio && 's3_url' in $selectAudio && $selectAudio.s3_url === data.song.s3_url
	);
	const playback = $derived(
		selected && $audioPlayback.trackId === data.song._id ? $audioPlayback : null
	);
	const playing = $derived(selected && $isPlaying);
	const loading = $derived(playing && (!playback || playback.status === 'loading'));
	const failed = $derived(playback?.status === 'error');
	const duration = $derived(playback?.durationSec || data.song.duration || 0);
	const elapsed = $derived(playback?.timeSec ?? 0);
	const audioUrl = $derived(encodeUrlPath(data.song.s3_url));
	const playClass =
		'grid size-12 shrink-0 place-items-center rounded-full bg-missionnaire text-stone-950 ring-4 ring-missionnaire/15 hover:bg-missionnaire-Yellow-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900';
	const playLabel = $derived(
		failed ? $t('errors.retry') : $t(playing ? 'player.pause' : 'music.listenHymn')
	);

	onMount(() => {
		ready = true;
		if (!controls || !('IntersectionObserver' in window)) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				controlsVisible = entry.intersectionRatio >= 0.75;
			},
			{ rootMargin: '-72px 0px 0px', threshold: 0.75 }
		);
		observer.observe(controls);
		return () => observer.disconnect();
	});

	$effect(() => {
		visibleInlineAudioTrack.set(controlsVisible ? (data.song._id ?? null) : null);
		return () => visibleInlineAudioTrack.set(null);
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

<div class="mx-auto w-full max-w-3xl px-2 pb-8 md:px-4">
	<Breadcrumbs items={[{ label: $t('nav.musique'), href: '/musique' }, { label: data.title }]} />
	<article>
		<header class="pb-6 pt-2 sm:pt-5">
			<h1
				class="break-words font-display text-[2.125rem] font-semibold leading-none text-stone-900 sm:text-5xl"
			>
				{data.title}
			</h1>
			{#if data.reference || data.song.artist}
				<p class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600">
					{#if data.reference}<span>{data.reference}</span>{/if}
					{#if data.song.artist}<span>{data.song.artist}</span>{/if}
				</p>
			{/if}

			<div class="mt-6 border border-stone-200 bg-white/70 p-3 sm:p-4">
				<div bind:this={controls} class="flex items-center gap-4 sm:gap-5">
					{#if ready}
						<button
							type="button"
							class={playClass}
							onclick={togglePlayback}
							aria-label={playLabel}
							title={playLabel}
						>
							<Icon src={playing ? BsPauseFill : BsPlayFill} size="24" />
						</button>
					{:else}
						<a
							href={audioUrl}
							class={playClass}
							aria-label={$t('music.listenHymn')}
							title={$t('music.listenHymn')}
						>
							<Icon src={BsPlayFill} size="24" />
						</a>
					{/if}

					<div class="min-w-0 flex-1">
						<input
							type="range"
							min="0"
							max={Math.max(1, duration)}
							step="1"
							value={Math.min(elapsed, duration)}
							disabled={!playback?.durationSec || failed}
							oninput={(event) => dispatchAudioPlayerSeek(event.currentTarget.valueAsNumber)}
							aria-label={$t('player.progressLabel')}
							aria-valuetext={$t('player.timeOf', {
								current: formatTime(elapsed),
								total: formatTime(duration)
							})}
							class="block h-6 w-full cursor-pointer rounded-full accent-missionnaire focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-missionnaire-Yellow-700 disabled:cursor-default"
						/>
						<div
							class="flex items-center justify-between gap-2 text-xs tabular-nums text-stone-600"
							aria-hidden="true"
						>
							<span>{formatTime(elapsed)}</span>
							<span>{duration > 0 ? formatTime(duration) : '–:––'}</span>
						</div>
					</div>
				</div>
				<div role="status">
					{#if loading || failed}
						<p
							class="mt-3 flex items-center gap-2 border-t border-stone-200 pt-3 text-sm text-stone-600"
						>
							{#if loading}
								<span
									aria-hidden="true"
									class="size-3 shrink-0 rounded-full border-2 border-missionnaire/30 border-t-missionnaire-Yellow-700 motion-safe:animate-spin"
								></span>
							{/if}
							{$t(failed ? 'music.audioUnavailable' : 'music.loadingAudio')}
						</p>
					{/if}
				</div>
				{#if loading || failed}
					<a
						href={audioUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="mt-1 inline-flex min-h-9 items-center text-sm font-semibold text-missionnaire-Yellow-700 underline underline-offset-4"
					>
						{$t('music.openAudio')}
					</a>
				{/if}
			</div>
		</header>

		{#if data.lyrics.length}
			<section aria-labelledby="hymn-lyrics" class="border-t border-stone-200 pt-5 sm:pt-7">
				<h2
					id="hymn-lyrics"
					class="mb-5 font-display text-2xl font-semibold text-stone-900 sm:text-3xl"
				>
					{$t('player.lyrics')}
				</h2>
				<div class="max-w-[38rem] space-y-2 text-[17px] leading-[1.75] text-stone-900 sm:text-lg">
					{#each data.lyrics as block}
						{#if block.heading}
							<h3 class="pt-4 text-sm font-semibold text-missionnaire-Yellow-700">
								{block.heading}
							</h3>
						{:else}
							<div
								class:pt-4={block.number || block.block !== undefined}
								class:italic={block.refrain}
							>
								{#if block.number}
									<h3 class="mb-1 text-sm font-semibold not-italic text-missionnaire-Yellow-700">
										{$t('music.verseLabel', { number: block.number })}
									</h3>
								{/if}
								{#each block.lines as line}
									{#each line as part}
										{#if part.repeat}
											<p class="mt-1 whitespace-pre-line text-stone-700">
												{part.text}
												<span
													aria-hidden="true"
													class="ml-1 whitespace-nowrap text-sm font-semibold not-italic text-missionnaire-Yellow-700"
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
						{/if}
					{/each}
				</div>
			</section>
		{/if}
	</article>
	<div class="mt-9 sm:mt-11"><HymnAppDownload /></div>
</div>
