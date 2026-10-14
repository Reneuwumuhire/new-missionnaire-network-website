<script lang="ts">
	import { t } from '../../../i18n';
	import { page } from '$app/stores';
	import { tick, untrack } from 'svelte';
	import type { MusicAudio } from '$lib/models/music-audio';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import { getPlayableAudioUrl } from '../../../utils/audioPlayback';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import AiOutlineDownload from 'svelte-icons-pack/ai/AiOutlineDownload';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoPauseCircle from 'svelte-icons-pack/io/IoPauseCircle';
	import BsHeartFill from 'svelte-icons-pack/bs/BsHeartFill';
	import BsHeart from 'svelte-icons-pack/bs/BsHeart';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';
	import {
		basePlaylist,
		currentIndex,
		isPlaying,
		isShuffle,
		playlist,
		selectAudio
	} from '$lib/stores/global';
	import {
		addToRecentlyPlayed,
		toggleFavorite,
		isFavorite,
		favorites
	} from '$lib/stores/musicHistory';
	import { formatTime } from '../../../utils/FormatTime';

	type InstrumentalTrack = Omit<MusicAudio, '_id'> & {
		_id: string;
		youtube_id: string;
		playlist_position: number;
	};
	let { data } = $props();
	let query = $state('');
	let visibleCount = $state(50);
	let tracks = $derived(data.tracks as InstrumentalTrack[]);
	let randomTrackIds = $state<string[] | null>(null);
	let displayedTracks = $derived(
		randomTrackIds
			? [...tracks].sort((a, b) => randomTrackIds!.indexOf(a._id) - randomTrackIds!.indexOf(b._id))
			: tracks
	);
	let filteredTracks = $derived(
		displayedTracks.filter((track) =>
			`${track.title ?? ''} ${track.artist ?? ''}`
				.toLocaleLowerCase()
				.includes(query.trim().toLocaleLowerCase())
		)
	);
	let visibleTracks = $derived(filteredTracks.slice(0, visibleCount));
	let handledPlayId = $state('');
	const desktopMusicGrid =
		'md:grid-cols-[28px_minmax(0,2fr)_minmax(0,0.95fr)_minmax(0,0.85fr)_58px_28px_36px_36px] lg:grid-cols-[30px_minmax(0,2.2fr)_minmax(0,1.05fr)_minmax(0,0.95fr)_68px_32px_40px_40px] xl:grid-cols-[30px_minmax(0,2.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_80px_32px_40px_40px]';

	$effect(() => {
		const playId = $page.url.searchParams.get('play');
		if (!playId || playId === handledPlayId || tracks.length === 0) return;
		const track = tracks.find((item) => item._id === playId);
		if (!track) return;
		untrack(() => (handledPlayId = playId));
		playTrack(track);
		void tick().then(() => dispatchAudioPlayerAction('play'));
	});

	function playTrack(track: InstrumentalTrack) {
		const queue = [...displayedTracks];
		basePlaylist.set(queue);
		if ($isShuffle) {
			const rest = queue.filter((item) => item._id !== track._id);
			for (let i = rest.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[rest[i], rest[j]] = [rest[j], rest[i]];
			}
			playlist.set([track, ...rest]);
			currentIndex.set(0);
		} else {
			playlist.set(queue);
			currentIndex.set(queue.findIndex((item) => item._id === track._id));
		}
		selectAudio.set(track);
		isPlaying.set(true);
		addToRecentlyPlayed(track);
	}

	function isActive(track: InstrumentalTrack) {
		return !!$selectAudio && 's3_url' in $selectAudio && $selectAudio.s3_url === track.s3_url;
	}

	function shuffleList() {
		const ids = tracks.map((track) => track._id);
		for (let i = ids.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[ids[i], ids[j]] = [ids[j], ids[i]];
		}
		randomTrackIds = ids;
		visibleCount = 50;
	}

	async function downloadTrack(track: InstrumentalTrack) {
		const url = getPlayableAudioUrl(track);
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error('Download failed');
			const blobUrl = window.URL.createObjectURL(await response.blob());
			const link = document.createElement('a');
			link.href = blobUrl;
			link.download = `${track.title || 'instrumental'}.mp3`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error('Instrumental download failed:', error);
			window.open(url, '_blank');
		}
	}
</script>

<div class="mx-auto w-full max-w-6xl px-4 pb-10 md:px-6">
	<section class="instrumental-hero relative overflow-hidden bg-stone-900 text-white">
		<div class="relative z-10 px-4 py-4 sm:px-8 sm:py-6">
			<div class="flex items-center justify-between gap-3 sm:gap-6">
				<div class="min-w-0">
					<h2 class="font-display text-[28px] leading-tight sm:text-3xl">
						{$t('music.instrumentalTitle')}
					</h2>
					<p class="mt-1 hidden max-w-xl font-body text-sm leading-6 text-white/75 sm:block">
						{$t('music.instrumentalDescription')}
					</p>
					<div
						class="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-white/70 sm:mt-2 sm:gap-x-5 sm:text-sm"
					>
						<span>{$t('music.instrumentalCollection')}</span>
						{#if tracks.length > 0}<span
								>{$t('music.instrumentalTracks', { count: tracks.length })}</span
							>{/if}
					</div>
				</div>
				{#if tracks.length > 0}
					<button
						class="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-missionnaire text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white sm:w-auto sm:gap-2 sm:px-5 sm:py-2.5 sm:font-body sm:text-sm sm:font-semibold sm:hover:bg-orange-600"
						onclick={() => playTrack(tracks[0])}
						aria-label={$t('music.instrumentalPlay')}
					>
						<span aria-hidden="true">▶</span>
						<span class="hidden sm:inline">{$t('music.instrumentalPlay')}</span>
					</button>
				{/if}
			</div>
		</div>
		<div class="piano-keys" aria-hidden="true">
			{#each Array(12) as _}<span></span>{/each}
		</div>
	</section>

	{#if tracks.length > 0}
		<div class="mt-3 flex flex-wrap items-end justify-end gap-2 pb-3 sm:mt-5 sm:gap-4 sm:pb-4">
			<label class="w-full sm:w-72">
				<span class="sr-only">{$t('music.instrumentalSearch')}</span>
				<input
					bind:value={query}
					oninput={() => (visibleCount = 50)}
					type="search"
					placeholder={$t('music.instrumentalSearch')}
					class="min-h-11 w-full border border-stone-300 bg-white px-4 font-body text-sm text-stone-900 placeholder:text-stone-400 focus:border-missionnaire focus:outline-none"
				/>
			</label>
		</div>

		<div class="flex min-h-[500px] flex-col overflow-hidden border border-stone-200/60 bg-white/40">
			<div
				class="grid grid-cols-[24px_1fr_auto_auto] {desktopMusicGrid} gap-1.5 border-b border-stone-200/60 bg-white/40 px-2 py-3 font-body text-[10px] font-bold uppercase tracking-widest text-stone-400 md:gap-3 md:px-3 md:text-[11px] lg:gap-4 lg:px-4"
			>
				<div class="text-center">#</div>
				<div class="min-w-0 truncate">{$t('list.title')}</div>
				<div class="hidden min-w-0 truncate md:block">{$t('music.collection')}</div>
				<div class="hidden min-w-0 truncate md:block">{$t('music.artist')}</div>
				<div class="hidden text-center md:block">{$t('list.duration')}</div>
				<div class="hidden md:block"></div>
				<div></div>
				<div class="flex items-center justify-center">
					<button
						class="text-stone-300 transition-all hover:scale-110 hover:text-missionnaire/60 active:scale-95 {randomTrackIds
							? 'text-missionnaire'
							: ''}"
						onclick={shuffleList}
						title={$t('music.shuffleList')}
						aria-label={$t('music.shuffleList')}
					>
						<Icon src={BsShuffle} size="16" />
					</button>
				</div>
			</div>
			<div class="divide-y divide-stone-100">
				{#each visibleTracks as track, rowIndex (track._id)}
					{@const active = isActive(track)}
					<div
						class="group grid cursor-pointer grid-cols-[24px_1fr_auto_auto] items-center gap-1.5 px-2 py-3 transition-all {desktopMusicGrid} {active
							? 'border-l-4 border-l-missionnaire bg-missionnaire/5'
							: 'hover:bg-white/60'} md:gap-3 md:px-3 md:py-4 lg:gap-4 lg:px-4"
						role="button"
						tabindex="0"
						aria-label={`${$t('player.playAction')}: ${track.title}`}
						onclick={() => playTrack(track)}
						onkeydown={(event) => {
							if (
								event.target === event.currentTarget &&
								(event.key === 'Enter' || event.key === ' ')
							) {
								event.preventDefault();
								playTrack(track);
							}
						}}
					>
						<div
							class="text-center font-body text-[10px] font-bold tabular-nums md:text-xs {active
								? 'text-missionnaire'
								: 'text-stone-300'}"
						>
							{rowIndex + 1}
						</div>
						<div class="flex min-w-0 flex-col">
							<div
								class="min-w-0 truncate font-body text-sm font-bold transition-colors {active
									? 'text-missionnaire'
									: 'text-stone-800 group-hover:text-missionnaire'}"
							>
								{track.title}
							</div>
							<div class="flex items-center gap-2 overflow-hidden whitespace-nowrap md:hidden">
								<span
									class="font-body text-[10px] font-medium {active
										? 'text-missionnaire/60'
										: 'text-stone-500'}">{track.book_full_name || track.category}</span
								>
								<span class="text-[10px] text-stone-300">•</span>
								<span
									class="truncate font-body text-[10px] font-medium italic {active
										? 'text-missionnaire/40'
										: 'text-stone-400'}">{track.artist}</span
								>
							</div>
						</div>
						<div
							class="hidden min-w-0 truncate font-body text-xs font-medium {active
								? 'text-missionnaire/60'
								: 'text-stone-500'} md:block"
						>
							{track.book_full_name || track.category}
						</div>
						<div
							class="hidden min-w-0 truncate font-body text-xs font-medium italic {active
								? 'text-missionnaire/40'
								: 'text-stone-400'} md:block"
						>
							{track.artist}
						</div>
						<div
							class="hidden text-center font-mono text-[11px] {active
								? 'text-missionnaire'
								: 'text-stone-400'} md:block lg:text-xs"
						>
							{track.duration ? formatTime(track.duration) : '--:--'}
						</div>
						<div class="hidden text-center md:block">
							<button
								class="p-1 transition-colors {isFavorite(track._id || track.s3_url, $favorites)
									? 'text-red-500'
									: 'text-stone-300 hover:text-red-400'} md:p-1.5"
								onclick={(event) => {
									event.stopPropagation();
									toggleFavorite(track);
								}}
								title={isFavorite(track._id || track.s3_url, $favorites)
									? $t('player.unfavorite')
									: $t('player.favorite')}
								aria-label={isFavorite(track._id || track.s3_url, $favorites)
									? $t('player.unfavorite')
									: $t('player.favorite')}
							>
								<Icon
									src={isFavorite(track._id || track.s3_url, $favorites) ? BsHeartFill : BsHeart}
									size="13"
								/>
							</button>
						</div>
						<div class="text-center">
							<button
								class="p-1.5 text-stone-400 transition-colors hover:text-missionnaire md:p-2"
								onclick={(event) => {
									event.stopPropagation();
									void downloadTrack(track);
								}}
								title={$t('player.download')}
								aria-label={$t('player.download')}
							>
								<Icon src={AiOutlineDownload} size="18" />
							</button>
						</div>
						<div class="text-center">
							<button
								class="p-1.5 text-missionnaire transition-all hover:scale-110 active:scale-95 md:p-2"
								onclick={(event) => {
									event.stopPropagation();
									if (active) dispatchAudioPlayerAction('toggle');
									else playTrack(track);
								}}
								title={active && $isPlaying ? $t('player.pause') : $t('player.playAction')}
								aria-label={active && $isPlaying ? $t('player.pause') : $t('player.playAction')}
							>
								<Icon src={active && $isPlaying ? IoPauseCircle : IoPlayCircle} size="22" />
							</button>
						</div>
					</div>
				{:else}
					<p class="px-5 py-12 text-center font-body text-sm text-stone-500">
						{$t('music.instrumentalEmpty')}
					</p>
				{/each}
			</div>
		</div>
		{#if visibleCount < filteredTracks.length}
			<div class="mt-5 text-center">
				<button
					class="min-h-11 border border-stone-300 px-5 font-body text-sm font-semibold text-stone-700 hover:border-missionnaire hover:text-missionnaire"
					onclick={() => (visibleCount += 50)}
				>
					{$t('music.instrumentalMore')}
				</button>
			</div>
		{/if}
	{:else}
		<div class="mx-auto mt-8 max-w-3xl">
			<p class="mb-4 font-body text-sm text-stone-600">{$t('music.instrumentalLoading')}</p>
			<div class="aspect-video bg-stone-900">
				<iframe
					class="h-full w-full"
					src="https://www.youtube-nocookie.com/embed/videoseries?list=PLOpV149mUpV858n5BYcIrec6YqirjvamD"
					title={$t('music.instrumentalTitle')}
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
					referrerpolicy="strict-origin-when-cross-origin"
					allowfullscreen
				></iframe>
			</div>
		</div>
	{/if}
</div>

<style>
	.instrumental-hero {
		background: radial-gradient(circle at 82% 20%, #55483d 0, #29211e 37%, #191715 75%);
	}
	.piano-keys {
		position: absolute;
		right: 0;
		bottom: -3rem;
		display: flex;
		height: 10rem;
		transform: rotate(-22deg);
		opacity: 0.16;
	}
	.piano-keys span {
		position: relative;
		width: 2.5rem;
		height: 100%;
		border: 2px solid white;
		background: white;
	}
	.piano-keys span:not(:nth-child(7n + 3)):not(:nth-child(7n + 7))::after {
		position: absolute;
		z-index: 1;
		top: 0;
		left: 72%;
		width: 58%;
		height: 58%;
		background: #191715;
		content: '';
	}
	@media (max-width: 640px) {
		.piano-keys {
			display: none;
		}
	}
</style>
