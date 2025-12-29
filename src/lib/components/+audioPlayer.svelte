<script lang="ts">
	import { browser } from '$app/environment';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { formatTime } from '../../utils/FormatTime';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoPlayBackOutline from 'svelte-icons-pack/io/IoPlayBackOutline';
	import IoPlayForwardOutline from 'svelte-icons-pack/io/IoPlayForwardOutline';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import BsPauseCircleFill from 'svelte-icons-pack/bs/BsPauseCircleFill';
	import BsVolumeUpFill from 'svelte-icons-pack/bs/BsVolumeUpFill';
	import BsVolumeMuteFill from 'svelte-icons-pack/bs/BsVolumeMuteFill';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';
	import { selectAudio, playlist, basePlaylist, currentIndex, autoNext, isShuffle, isPlaying } from '../stores/global';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import IoRepeat from 'svelte-icons-pack/io/IoRepeat';
	import RiMediaPlayList2Fill from 'svelte-icons-pack/ri/RiMediaPlayList2Fill';
	import IoPlaySkipBackOutline from 'svelte-icons-pack/io/IoPlaySkipBackOutline';
	import IoPlaySkipForwardOutline from 'svelte-icons-pack/io/IoPlaySkipForwardOutline';

	let audio: HTMLAudioElement;
	let currentTime = 0;
	let duration = 0;
	let progressBarWidth = 0;
	let indicatorPosition = 0;
	let isDragging = false;
	let initialClickX = 0;
	let initialIndicatorPosition = 0;
	let volume = 1; // Initial volume (1 = full volume, 0 = mute)
	let isMuted = false;
	let audioSrc: string = '';

	function handleEnded() {
		isPlaying = false;
		if ($autoNext && $playlist.length > 0) {
			const nextIndex = $currentIndex + 1;
			if (nextIndex < $playlist.length) {
				currentIndex.set(nextIndex);
				selectAudio.set($playlist[nextIndex]);
			}
		}
	}

	const toggleAutoNext = () => {
		autoNext.update((v) => !v);
	};

	function toggleShuffle() {
		isShuffle.update(shuffle => {
			const newShuffle = !shuffle;
			if (newShuffle) {
				// Shuffle logic
				const currentSong = $selectAudio;
				const list = [...$playlist];
				
				// Fisher-Yates shuffle
				for (let i = list.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[list[i], list[j]] = [list[j], list[i]];
				}
				
				// Ensure current song is at its new position and update index
				playlist.set(list);
				if (currentSong) {
					const newIndex = list.findIndex(s => 
						('s3_url' in s ? s.s3_url : s.url) === 
						('s3_url' in currentSong ? currentSong.s3_url : currentSong.url)
					);
					if (newIndex !== -1) currentIndex.set(newIndex);
				}
			} else {
				// Restore original order
				const currentSong = $selectAudio;
				const originalList = $basePlaylist;
				playlist.set(originalList);
				
				if (currentSong) {
					const newIndex = originalList.findIndex(s => 
						('s3_url' in s ? s.s3_url : s.url) === 
						('s3_url' in currentSong ? currentSong.s3_url : currentSong.url)
					);
					if (newIndex !== -1) currentIndex.set(newIndex);
				}
			}
			return newShuffle;
		});
	}

	function playNext() {
		if ($playlist.length > 0) {
			const nextIndex = ($currentIndex + 1) % $playlist.length;
			currentIndex.set(nextIndex);
			selectAudio.set($playlist[nextIndex]);
		}
	}

	function playPrevious() {
		if ($playlist.length > 0) {
			const prevIndex = ($currentIndex - 1 + $playlist.length) % $playlist.length;
			currentIndex.set(prevIndex);
			selectAudio.set($playlist[prevIndex]);
		}
	}

	function updateAudioSource(url: string) {
		if (!url) return;
		
		if (audio) {
			audio.pause();
			audio.src = url;
			audio.load();
		} else {
			audio = new Audio(url);
			audio.crossOrigin = 'anonymous'; // Good practice for external streams
			audio.addEventListener('ended', handleEnded);
			audio.addEventListener('timeupdate', updateAudioTime);
			audio.addEventListener('timeupdate', updateIndicator);
			audio.addEventListener('play', () => { isPlaying.set(true); });
			audio.addEventListener('pause', () => { isPlaying.set(false); });
			audio.addEventListener('loadedmetadata', () => {
				duration = audio.duration;
			});
		}

		// Ensure we attempt to play after source change
		const playPromise = audio.play();
		if (playPromise !== undefined) {
			playPromise.catch(error => {
				console.error("Playback failed (possibly browser policy):", error);
				isPlaying.set(false);
			});
		}
		duration = 0;
	}

	$: if ($selectAudio) {
		const newSelected = $selectAudio;
		const url = 's3_url' in newSelected ? newSelected.s3_url : (newSelected as AudioAsset).url;
		if (url && url !== audioSrc) {
			audioSrc = url;
			updateAudioSource(url);
		}
	}

	const toggleMute = () => {
		if (!audio) return;

		if (isMuted) {
			audio.volume = volume;
		} else {
			volume = audio.volume;
			audio.volume = 0;
		}
		isMuted = !isMuted;
	};

	let progressBarElement: HTMLDivElement;

	const startDrag = (event: TouchEvent | MouseEvent) => {
		isDragging = true;
		handleDrag(event); // Initial seek on click/touch
	};

	const endDrag = () => {
		isDragging = false;
	};

	const handleDrag = (event: TouchEvent | MouseEvent) => {
		if (!isDragging || !progressBarElement || !duration) return;

		// Get clientX from mouse or touch
		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const rect = progressBarElement.getBoundingClientRect();
		
		// Calculate percentage
		let percentage = (clientX - rect.left) / rect.width;
		percentage = Math.max(0, Math.min(1, percentage));
		
		// Update UI immediately for smoothness
		// Also update indicatorPosition so the knob follows the simplified logic
		progressBarWidth = percentage * 100;
		indicatorPosition = progressBarWidth; 
		
		// Update audio
		if (audio) {
			const newTime = percentage * duration;
			if (Math.abs(audio.currentTime - newTime) > 0.1) {
				audio.currentTime = newTime;
			}
		}
	};

	const seekForward = () => {
		if (!audio) return;
		audio.currentTime += 5;
		updateAudioTime();
		updateIndicator();
	};

	const seekBackward = () => {
		if (!audio) return;
		audio.currentTime -= 5;
		updateAudioTime();
		updateIndicator();
	};

	const togglePlay = async () => {
		if (!audio) return;

		try {
			if (audio.paused) {
				await audio.play();
			} else {
				audio.pause();
			}
			// isPlaying will be updated via listeners
		} catch (error) {
			console.error('Playback failed:', error);
		}
	};
	// Update the current time and duration as the audio plays
	const updateAudioTime = () => {
		if (audio) {
			currentTime = audio.currentTime;
			duration = audio.duration;
			progressBarWidth = (currentTime / duration) * 100;
		}
	};
	const updateIndicator = () => {
		if (!audio) return;

		const currentTime = audio.currentTime;
		const duration = audio.duration;
		indicatorPosition = (currentTime / duration) * 100 || 0;
	};
	const seekTo = (event: TouchEvent | MouseEvent) => {
		if (!audio) return;

		const progressBar = event.currentTarget as HTMLDivElement;
		const rect = progressBar.getBoundingClientRect();
		const clickX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const barWidth = rect.width;
		let newPosition = ((clickX - rect.left) / barWidth) * duration;

		if (newPosition < 0) {
			newPosition = 0;
		} else if (newPosition > duration) {
			newPosition = duration;
		}

		audio.currentTime = newPosition;
		updateAudioTime();
		indicatorPosition = (currentTime / duration) * 100;
	};
	const dragIndicator = (event: TouchEvent | MouseEvent) => {
		if (!audio || !isDragging) return;

		const progressBar = event.currentTarget as HTMLDivElement;
		const rect = progressBar.getBoundingClientRect();
		const clickX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const barWidth = rect.width;
		let newPosition = ((clickX - rect.left) / barWidth) * duration;

		if (newPosition < 0) {
			newPosition = 0;
		} else if (newPosition > duration) {
			newPosition = duration;
		}

		audio.currentTime = newPosition;
		updateAudioTime();
		const delta = clickX - initialClickX;
		indicatorPosition = Math.min(
			100,
			Math.max(0, initialIndicatorPosition + (delta / barWidth) * 100)
		);
	};

	// Add your audio file path

	onMount(() => {
		// No need to init audio here, the reactive statement handles it
	});

	// Media Session API for Hardware Keys & Metadata
	$: if (browser && $selectAudio && 'mediaSession' in navigator) {
		const current = $selectAudio;
		const isMusic = 'category' in current;
		
		navigator.mediaSession.metadata = new MediaMetadata({
			title: current.title || 'Sans titre',
			artist: isMusic ? (current as MusicAudio).artist || 'Artiste inconnu' : 'Missionnaire',
			album: isMusic 
				? (current as MusicAudio).book_full_name || (current as MusicAudio).category || 'Missionnaire'
				: 'Media',
			artwork: [
				{ src: '/logo.png', sizes: '512x512', type: 'image/png' },
			]
		});

		navigator.mediaSession.setActionHandler('play', togglePlay);
		navigator.mediaSession.setActionHandler('pause', togglePlay);
		navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
		navigator.mediaSession.setActionHandler('nexttrack', playNext);
		navigator.mediaSession.setActionHandler('seekbackward', () => seekBackward());
		navigator.mediaSession.setActionHandler('seekforward', () => seekForward());
	}

	// Keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
		// Don't trigger if user is typing in an input or textarea
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

		const key = event.key.toLowerCase();

		switch (key) {
			case 'n': // Next
				playNext();
				break;
			case 'p': // Previous
				playPrevious();
				break;
			case 'arrowright': // Seek Forward
				seekForward();
				break;
			case 'arrowleft': // Seek Backward
				seekBackward();
				break;
			case ' ': // Space bar - Play/Pause
				event.preventDefault(); // Prevent page scroll
				togglePlay();
				break;
			case 'm': // Mute
				toggleMute();
				break;
		}
	}

	// Ensure audio is stopped when the component is unmounted
	onDestroy(() => {
		if (audio) {
			audio.pause();
			audio.removeEventListener('ended', handleEnded);
			audio.removeEventListener('timeupdate', updateAudioTime);
			audio.removeEventListener('timeupdate', updateIndicator);
		}
	});
</script>

<svelte:window 
	on:keydown={handleKeydown} 
	on:mousemove={handleDrag}
	on:touchmove={handleDrag}
	on:mouseup={endDrag}
	on:touchend={endDrag}
/>

<div class="fixed z-[100] bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] pb-safe pt-2 md:pt-4 md:pb-4 transition-all duration-300">
	<!-- Top Progress Bar -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	bind:this={progressBarElement}
	class="absolute top-0 left-0 w-full h-8 -translate-y-1/2 cursor-pointer group/progress flex items-center justify-start z-50 touch-none select-none transition-all"
	on:mousedown={startDrag}
	on:touchstart|nonpassive={startDrag}
	on:click={seekTo}
>
	<!-- Visual Track -->
	<div class="w-full h-[4px] bg-gray-200 relative overflow-visible rounded-full">
		<!-- Active Progress -->
		<div 
			class="h-full bg-orange-500 rounded-full relative" 
			style="width: {progressBarWidth}%"
		>
			<!-- Indicator Knob -->
			<div 
				class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-orange-500 border-[3px] border-white rounded-full shadow-md transform transition-transform duration-100 {isDragging ? 'scale-125' : 'scale-100'} md:scale-0 md:group-hover/progress:scale-100"
			></div>
		</div>
	</div>
</div>

	<div class="px-5 md:px-10 max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:gap-8">
		<!-- Info Row -->
		<div class="flex items-center justify-between mb-3 md:mb-0 md:flex-1 md:min-w-0">
			<div class="flex-1 min-w-0">
				<div class="text-[10px] uppercase tracking-[0.2em] font-bold text-orange-500 mb-0.5 opacity-80">Lecture en cours</div>
				<div class="font-black text-sm md:text-lg text-missionnaire truncate pr-4">
					{$selectAudio?.title || 'Chargement...'}
				</div>
				<div class="flex items-center gap-2 mt-0.5 md:hidden">
					<span class="text-[10px] font-medium text-gray-400">{formatTime(currentTime)}</span>
					<div class="w-1 h-1 rounded-full bg-gray-200"></div>
					<span class="text-[10px] font-medium text-gray-400">{formatTime(duration)}</span>
				</div>
			</div>
			
			<button
				class="bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-800 p-2 rounded-full transition-colors md:hidden"
				on:click={() => {
					selectAudio.set(null);
					if (audio) audio.pause();
				}}
			>
				<Icon src={BsX} size="20" />
			</button>
		</div>

		<!-- Controls & Time Row -->
		<div class="flex flex-col items-center md:flex-row md:gap-6 w-full md:w-auto">
			<!-- Main Playback Controls -->
			<div class="flex items-center justify-center gap-4 md:gap-6">
				<!-- Repeat/Auto-next on mobile side -->
				<div class="flex md:hidden items-center gap-1">
					<button 
						on:click={toggleShuffle} 
						class="p-2 transition-all {$isShuffle ? 'text-orange-500' : 'text-gray-300'}"
					>
						<Icon src={BsShuffle} size="16" />
					</button>
				</div>

				<div class="flex items-center gap-1 md:gap-3">
					<button on:click={playPrevious} class="p-2 text-missionnaire hover:text-orange-600 transition-colors" title="Précédent">
						<Icon src={IoPlaySkipBackOutline} size="24" />
					</button>
					
					<button on:click={seekBackward} class="hidden md:block p-2 text-gray-300 hover:text-missionnaire transition-colors" title="-5s">
						<Icon src={IoPlayBackOutline} size="18" />
					</button>

					<button on:click={togglePlay} class="relative flex items-center justify-center w-14 h-14 md:w-12 md:h-12 bg-missionnaire text-white rounded-full hover:scale-105 transition-transform shadow-lg shadow-missionnaire/20 active:scale-95">
						{#if isPlaying}
							<Icon src={BsPauseCircleFill} size="32" />
						{:else}
							<Icon src={BsPlayCircleFill} size="32" />
						{/if}
					</button>

					<button on:click={seekForward} class="hidden md:block p-2 text-gray-300 hover:text-missionnaire transition-colors" title="+5s">
						<Icon src={IoPlayForwardOutline} size="18" />
					</button>

					<button on:click={playNext} class="p-2 text-missionnaire hover:text-orange-600 transition-colors" title="Suivant">
						<Icon src={IoPlaySkipForwardOutline} size="24" />
					</button>
				</div>

				<!-- Auto-Next Side -->
				<div class="flex md:hidden items-center gap-1">
					<button 
						on:click={toggleAutoNext} 
						class="p-2 transition-all {$autoNext ? 'text-orange-500 bg-orange-50 rounded-lg' : 'text-gray-300'}"
						title={$autoNext ? 'Lecture auto activée' : 'Lecture auto désactivée'}
					>
						<Icon src={RiMediaPlayList2Fill} size="18" />
					</button>
				</div>
			</div>

			<!-- Time & Extra Controls (Desktop) -->
			<div class="hidden md:flex items-center gap-6">
				<div class="flex items-center gap-1.5 font-bold text-[13px] text-gray-500 min-w-[90px]">
					<span class="text-missionnaire">{formatTime(currentTime)}</span>
					<span class="text-gray-300">/</span>
					<span>{formatTime(duration)}</span>
				</div>

				<div class="flex items-center gap-2 border-l border-gray-100 pl-6">
					<button 
						on:click={toggleShuffle} 
						class="p-2.5 rounded-full transition-all flex items-center gap-2 {$isShuffle ? 'bg-orange-500 text-white' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'}"
						title={$isShuffle ? 'Aléatoire activé' : 'Aléatoire désactivé'}
					>
						<Icon src={BsShuffle} size="16" />
					</button>

					<button 
						on:click={toggleAutoNext} 
						class="p-2.5 rounded-full transition-all flex items-center gap-2 {$autoNext ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}"
						title={$autoNext ? 'Lecture auto activée' : 'Lecture auto désactivée'}
					>
						<Icon src={RiMediaPlayList2Fill} size="18" />
					</button>

					<div class="flex items-center gap-2 ml-2">
						<button on:click={toggleMute} class="p-2 text-gray-400 hover:text-missionnaire transition-colors">
							{#if !isMuted}
								<Icon src={BsVolumeUpFill} size="20" />
							{:else}
								<Icon src={BsVolumeMuteFill} size="20" />
							{/if}
						</button>
					</div>

					<button
						class="ml-4 bg-gray-900 text-white p-2 rounded-full hover:bg-black transition-colors"
						on:click={() => {
							selectAudio.set(null);
							if (audio) audio.pause();
						}}
					>
						<Icon src={BsX} size="20" />
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
</style>
