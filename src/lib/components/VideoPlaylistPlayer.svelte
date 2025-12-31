<script lang="ts">
	import { browser } from '$app/environment';
	import { tick, onMount } from 'svelte';
	import { isVideoPlaylistActive, videoPlaylist, videoPlaylistIndex, isVideoShuffle, videoPlaylistSearch, videoPlaylistTotal } from '$lib/stores/global';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';
	import IoPlaySkipBackOutline from 'svelte-icons-pack/io/IoPlaySkipBackOutline';
	import IoPlaySkipForwardOutline from 'svelte-icons-pack/io/IoPlaySkipForwardOutline';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import BsPauseCircleFill from 'svelte-icons-pack/bs/BsPauseCircleFill';
	import IoRepeat from 'svelte-icons-pack/io/IoRepeat';
	import { fade } from 'svelte/transition';
	import { formatTime } from '../../utils/FormatTime';

	let player: any;
	let playerElement: HTMLElement;
	let ytApiReady = browser && !!(window as any).YT?.Player;
	let playerState = -1; 
	let currentTime = 0;
	let duration = 0;
	let progressInterval: any;
	let isInitializing = false;
	let isFetchingMore = false;
	let isRepeat = false;
	let isPlayerReady = false;

	$: currentVideo = $videoPlaylist && $videoPlaylist.length > 0 ? $videoPlaylist[$videoPlaylistIndex] : null;

	// Predictive loading: load more when near the end
	$: if ($videoPlaylist.length > 0 && $videoPlaylistIndex >= $videoPlaylist.length - 3) {
		loadMore();
	}

	// Body scroll lock
	$: if (browser) {
		if ($isVideoPlaylistActive) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
	}

	function onPlayerStateChange(event: any) {
		playerState = event.data;
		if (event.data === 1) { // PLAYING
			duration = player.getDuration();
			startProgressTracking();
		} else {
			stopProgressTracking();
		}

		if (event.data === 0) { // ENDED
			if (isRepeat) {
				player.seekTo(0);
				player.playVideo();
			} else {
				nextVideo();
			}
		}
	}

	function startProgressTracking() {
		stopProgressTracking();
		progressInterval = setInterval(() => {
			if (player?.getCurrentTime) {
				currentTime = player.getCurrentTime();
			}
		}, 500);
	}

	function stopProgressTracking() {
		if (progressInterval) clearInterval(progressInterval);
	}

	async function createYTPlayer() {
		if (!$isVideoPlaylistActive || isInitializing || !ytApiReady) return;
		
		isInitializing = true;
		isPlayerReady = false;

		// Ensure DOM is ready (especially when coming from closed state)
		await tick();
		
		if (!playerElement) {
			console.log('[Playlist] Player element not ready yet, retrying soon...');
			isInitializing = false;
			return;
		}

		if (!currentVideo) {
			isInitializing = false;
			return;
		}

		console.log('[Playlist] Creating player for:', currentVideo.title);

		if (player?.destroy) {
			try { player.destroy(); } catch(e) {}
		}

		player = new (window as any).YT.Player(playerElement, {
			height: '100%',
			width: '100%',
			videoId: currentVideo.id,
			playerVars: {
				autoplay: 1,
				modestbranding: 1,
				rel: 0,
				playsinline: 1
			},
			events: {
				onStateChange: onPlayerStateChange,
				onReady: (e: any) => {
					console.log('[Playlist] Player ready');
					isPlayerReady = true;
					e.target.unMute();
					e.target.playVideo();
					setTimeout(() => { if (playerState !== 1) e.target.playVideo(); }, 1200);
				}
			}
		});
		isInitializing = false;
	}

	$: if (browser && $isVideoPlaylistActive && ytApiReady) {
		if (!player && !isInitializing) {
			createYTPlayer();
		} else if (isPlayerReady && player?.loadVideoById && currentVideo && player.getVideoData()?.video_id !== currentVideo.id) {
			console.log('[Playlist] Loading video:', currentVideo.title);
			player.loadVideoById(currentVideo.id);
			currentTime = 0;
		}
	}

	$: if (browser && !$isVideoPlaylistActive && player) {
		console.log('[Playlist] Destroying player on close');
		isPlayerReady = false;
		try { player.destroy(); } catch(e) {}
		player = null;
	}

	onMount(() => {
		const handleReady = () => { ytApiReady = true; };
		window.addEventListener('yt-ready', handleReady);
		if ((window as any).YT?.Player) ytApiReady = true;

		return () => {
			window.removeEventListener('yt-ready', handleReady);
			stopProgressTracking();
		};
	});

	async function loadMore() {
		if (isFetchingMore || $videoPlaylist.length >= $videoPlaylistTotal) return;
		isFetchingMore = true;
		try {
			const queryParams = new URLSearchParams({
				type: 'song',
				search: $videoPlaylistSearch,
				maxResults: '20',
				skip: $videoPlaylist.length.toString()
			});

			const response = await fetch(`/api/yt/videos?${queryParams.toString()}`);
			if (response.ok) {
				const result = await response.json();
				if (result.data && result.data.length > 0) {
					const newVideos = result.data.filter((v: any) => !$videoPlaylist.some((ev) => ev._id === v._id));
					if (newVideos.length > 0) {
						console.log('[Playlist] Appending new videos:', newVideos.length);
						videoPlaylist.update(list => [...list, ...newVideos]);
						videoPlaylistTotal.set(result.total);
					} else {
						console.log('[Playlist] No new unique videos found');
					}
				} else {
					console.log('[Playlist] No more videos available in response');
				}
			} else {
				console.error('[Playlist] Fetch failed:', response.status);
			}
		} catch (error) {
			console.error('[Playlist] Error loading more:', error);
		} finally {
			isFetchingMore = false;
		}
	}

	function togglePlay() {
		if (!player) return;
		if (playerState === 1) player.pauseVideo();
		else player.playVideo();
	}

	async function nextVideo() {
		if ($videoPlaylist.length === 0) return;
		if ($videoPlaylistIndex === $videoPlaylist.length - 1) {
			if ($videoPlaylist.length < $videoPlaylistTotal) await loadMore();
		}
		videoPlaylistIndex.update(i => (i + 1) % $videoPlaylist.length);
	}

	function prevVideo() {
		if ($videoPlaylist.length === 0) return;
		videoPlaylistIndex.update(i => (i - 1 + $videoPlaylist.length) % $videoPlaylist.length);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!$isVideoPlaylistActive) return;
		const key = event.key;
		if (key === 'ArrowRight' || key === 'n' || key === 'N') nextVideo();
		else if (key === 'ArrowLeft' || key === 'p' || key === 'P') prevVideo();
		else if (key === 'Escape') isVideoPlaylistActive.set(false);
		else if (key === ' ') {
			event.preventDefault();
			togglePlay();
		}
	}

	function seekTo(event: any) {
		if (!player || !duration) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - rect.left;
		player.seekTo((x / rect.width) * duration, true);
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $isVideoPlaylistActive}
	<div 
		class="fixed inset-0 z-[500] bg-[#0f0f0f] text-white flex flex-col items-center justify-center overflow-hidden"
		transition:fade={{ duration: 200 }}
	>
		<!-- Background blur for atmospheric feel -->
		{#if currentVideo}
			<div class="absolute inset-0 z-0 opacity-20 pointer-events-none overflow-hidden">
				<img src={currentVideo.thumbnail} alt="" class="w-full h-full object-cover blur-[120px] scale-125" />
			</div>
		{/if}

		<!-- Close Button -->
		<button 
			on:click={() => isVideoPlaylistActive.set(false)}
			class="absolute top-4 right-4 text-white/60 hover:text-white transition-all p-2 z-[550] hover:bg-white/10 rounded-full"
			title="Fermer"
		>
			<Icon src={BsX} size="32" />
		</button>

		<div class="relative z-10 w-full h-full max-w-[1700px] flex flex-col lg:flex-row lg:items-stretch lg:justify-between p-4 md:p-6 lg:p-8 xl:p-12 gap-6 lg:gap-10">
			
			<!-- Main content: Player & Metadata -->
			<div class="flex-1 flex flex-col min-w-0">
				<!-- Video Player Area -->
				<div class="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group flex-shrink-0">
					<div bind:this={playerElement} class="w-full h-full"></div>
					
					{#if playerState !== 1 && playerState !== 3}
						<button 
							on:click={togglePlay}
							class="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px] transition-all hover:bg-black/30"
						>
							<div class="text-white opacity-80 group-hover:opacity-100 transform transition-all duration-300 scale-90 group-hover:scale-100">
								<Icon src={BsPlayCircleFill} size="90" />
							</div>
						</button>
					{/if}
				</div>

				<!-- Metadata below the video -->
				<div class="mt-6 space-y-4">
					<h1 class="font-bold text-xl md:text-2xl lg:text-3xl tracking-tight leading-tight line-clamp-2">
						{currentVideo?.title || 'Chargement...'}
					</h1>
					
					<div class="flex flex-wrap items-center justify-between gap-4">
						<div class="flex items-center gap-4 text-sm font-medium text-white/70">
							<div class="bg-white/10 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-[#f28f3e]">
								En cours de lecture
							</div>
							<span class="opacity-40">•</span>
							<span>{formatTime(currentTime)} / {formatTime(duration)}</span>
						</div>

						<div class="flex items-center gap-2 md:gap-4">
							<button on:click={prevVideo} class="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all" title="Précédent">
								<Icon src={IoPlaySkipBackOutline} size="24" />
							</button>
							<button 
								on:click={togglePlay} 
								class="p-2 text-white hover:scale-110 transition-all"
							>
								{#if playerState === 1}
									<Icon src={BsPauseCircleFill} size="54" />
								{:else}
									<Icon src={BsPlayCircleFill} size="54" />
								{/if}
							</button>
							<button on:click={nextVideo} class="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all" title="Suivant">
								<Icon src={IoPlaySkipForwardOutline} size="24" />
							</button>
						</div>
					</div>

					<!-- Progress bar -->
					<div 
						class="h-1 w-full bg-white/10 rounded-full cursor-pointer relative group mt-2"
						on:click={seekTo}
						on:keydown={(e) => {
							if (e.key === 'ArrowRight') player.seekTo(currentTime + 5, true);
							else if (e.key === 'ArrowLeft') player.seekTo(currentTime - 5, true);
						}}
						role="slider"
						aria-label="Position de la vidéo"
						aria-valuemin="0"
						aria-valuemax={duration}
						aria-valuenow={currentTime}
						tabindex="0"
					>
						<div 
							class="absolute top-0 left-0 h-full bg-[#f28f3e] rounded-full shadow-[0_0_8px_rgba(242,143,62,0.6)]"
							style="width: {(currentTime / (duration || 1)) * 100}%"
						></div>
					</div>
				</div>
			</div>

			<!-- Sidebar: Playlist (YouTube style) -->
			<div class="w-full lg:w-[400px] xl:w-[450px] flex flex-col bg-[#1a1a1a] rounded-2xl border border-white/5 overflow-hidden shadow-xl max-h-[400px] lg:max-h-none">
				<!-- Sidebar Header -->
				<div class="p-5 border-b border-white/5 bg-[#252525]">
					<div class="flex items-center justify-between mb-2">
						<h3 class="font-bold text-lg">À regarder plus tard</h3>
						<button 
							on:click={() => isVideoPlaylistActive.set(false)}
							class="text-white/40 hover:text-white lg:hidden"
						>
							<Icon src={BsX} size="24" />
						</button>
					</div>
					<div class="flex items-center justify-between text-xs font-medium text-white/50">
						<span>{currentVideo?.artist || 'Privé'} • {$videoPlaylistIndex + 1} / {$videoPlaylist.length}</span>
						<div class="flex items-center gap-3">
							<button 
								on:click={() => isVideoShuffle.update(s => !s)}
								class="hover:text-white transition-colors {$isVideoShuffle ? 'text-[#f28f3e]' : ''}"
								title="Aléatoire"
							>
								<Icon src={BsShuffle} size="18" />
							</button>
							<button 
								on:click={() => isRepeat = !isRepeat}
								class="hover:text-white transition-colors {isRepeat ? 'text-[#f28f3e]' : ''}"
								title="Répéter"
							>
								<Icon src={IoRepeat} size="20" />
							</button>
						</div>
					</div>
				</div>

				<!-- Sidebar List -->
				<div class="flex-1 overflow-y-auto custom-scrollbar bg-[#0f0f0f]">
					{#each $videoPlaylist as video, i}
						<button 
							on:click={() => videoPlaylistIndex.set(i)}
							class="w-full flex items-center gap-3 p-2 group transition-all {i === $videoPlaylistIndex ? 'bg-white/[0.08]' : 'hover:bg-white/5'}"
						>
							<!-- Index and Status Icon -->
							<div class="w-8 flex-shrink-0 text-center text-xs font-medium text-white/40 group-hover:text-white/60">
								{#if i === $videoPlaylistIndex}
									<div class="text-[#f28f3e] flex justify-center">
										{#if playerState === 1}
											<div class="flex items-end gap-0.5 h-3">
												<div class="w-1 bg-current animate-[music-bar_0.8s_ease-in-out_infinite]"></div>
												<div class="w-1 bg-current animate-[music-bar_1.2s_ease-in-out_infinite]"></div>
												<div class="w-1 bg-current animate-[music-bar_1s_ease-in-out_infinite]"></div>
											</div>
										{:else}
											<Icon src={BsPlayCircleFill} size="12" />
										{/if}
									</div>
								{:else}
									{i + 1}
								{/if}
							</div>

							<!-- Thumbnail -->
							<div class="relative w-24 xl:w-28 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-black">
								<img src={video.thumbnail} alt="" class="w-full h-full object-cover" />
								<div class="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[10px] font-bold">
									{video.duration_string || '--:--'}
								</div>
							</div>

							<!-- Info -->
							<div class="text-left min-w-0 flex-1">
								<p class="text-sm font-semibold line-clamp-2 leading-snug transition-colors {i === $videoPlaylistIndex ? 'text-[#f28f3e]' : 'text-white/90 group-hover:text-white'}">
									{video.title}
								</p>
								<p class="text-[10px] text-white/40 mt-1 font-medium truncate uppercase tracking-tight">
									{video.artist || 'Missionnaire Network'}
								</p>
							</div>
						</button>
					{/each}

					{#if $videoPlaylist.length < $videoPlaylistTotal}
						<div class="p-4 flex justify-center border-t border-white/5">
							<button 
								on:click={loadMore}
								disabled={isFetchingMore}
								class="w-full py-3 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
							>
								{#if isFetchingMore}
									Chargement...
								{:else}
									Charger plus de vidéos
								{/if}
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.custom-scrollbar::-webkit-scrollbar { width: 4px; }
	.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
	.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
	.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@keyframes music-bar {
		0%, 100% { height: 4px; }
		50% { height: 12px; }
	}
</style>
