<script lang="ts">
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
	import { selectAudio } from '../stores/global';
	import type { AudioAsset } from '@mnlib/lib/models/media-assets';

	let audio: HTMLAudioElement;
	let isPlaying = false;
	let currentTime = 0;
	let duration = 0;
	let progressBarWidth = 0;
	let indicatorPosition = 0;
	let isDragging = false;
	let initialClickX = 0;
	let initialIndicatorPosition = 0;
	let volume = 1; // Initial volume (1 = full volume, 0 = mute)
	let isMuted = false;
	let selectedAudioToPlay: AudioAsset | null = null;
	let audioSrc: string;

	function updateAudioSource(url: string) {
		if (audio) {
			audio.pause();
			audio.src = url;
			audio.load();
			duration = 0; // Reset duration
			audio.play();
		} else {
			audio = new Audio(url);
			audio.addEventListener('ended', () => {
				isPlaying = false;
			});
			audio.addEventListener('timeupdate', updateAudioTime);
			audio.addEventListener('timeupdate', updateIndicator);
			audio.addEventListener('loadedmetadata', () => {
				duration = audio.duration; // Set duration after metadata is loaded
				audio.play();
				isPlaying = true;
			});
		}
	}

	$: if (selectedAudioToPlay) {
		updateAudioSource(selectedAudioToPlay.url);
	}

	selectedAudioToPlay = getContext('selectedAudio');
	selectAudio.subscribe((value) => {
		selectedAudioToPlay = value;
		if (selectedAudioToPlay) audioSrc = selectedAudioToPlay.url;
	});

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

	const startDrag = (event: TouchEvent | MouseEvent) => {
		isDragging = true;
		initialClickX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		initialIndicatorPosition = indicatorPosition;
	};

	const endDrag = () => {
		isDragging = false;
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
			if (isPlaying) {
				await audio.pause();
			} else {
				await audio.play();
			}
			isPlaying = !isPlaying;
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
		audio = new Audio(audioSrc);
		audio.addEventListener('ended', () => {
			isPlaying = false;
		});
		// Update time every second while playing
		audio.addEventListener('timeupdate', updateAudioTime);
		audio.addEventListener('timeupdate', updateIndicator);
	});

	// Ensure audio is stopped when the component is unmounted
	onDestroy(() => {
		if (audio) {
			audio.pause();
		}
	});
</script>

<div class="fixed z-20 bottom-0 bg-white w-full px-5 md:px-10 py-5 drop-shadow-2xl">
	<div class="flex flex-row items-center justify-between w-full">
		<div
			class=" max-w-xs font-semibold text-xs md:text-lg text-missionnaire my-2 md:max-w-full text-ellipsis overflow-hidden line-clamp-1"
		>
			{selectedAudioToPlay?.title}
		</div>
		<!-- close button -->
		<div class=" flex flex-row justify-end">
			<button
				class=" text-black text-2xl px-2 border rounded-full"
				on:click={() => {
					selectAudio.set(null);
					if (audio) {
						audio.pause();
					}
				}}
			>
				<Icon src={BsX} />
			</button>
		</div>
	</div>
	<div class=" flex flex-col space-y-5 md:flex-row items-center md:space-x-9 text-2xl">
		<!-- controls -->
		<div class="flex flex-row px-2 md:px-3 py-2 border space-x-4 md:space-x-11">
			<button on:click={seekBackward} class=" text-missionnaire">
				<Icon src={IoPlayBackOutline} />
			</button>
			<button on:click={togglePlay} class=" text-missionnaire text-5xl">
				{#if isPlaying}
					<Icon src={BsPauseCircleFill} />
				{/if}
				{#if !isPlaying}
					<Icon src={BsPlayCircleFill} />
				{/if}
			</button>
			<button on:click={seekForward} class=" text-missionnaire">
				<Icon src={IoPlayForwardOutline} />
			</button>
		</div>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			on:mousedown={startDrag}
			on:mouseup={endDrag}
			on:mouseleave={endDrag}
			on:mousemove={dragIndicator}
			on:touchstart={startDrag}
			on:touchend={endDrag}
			on:touchmove={dragIndicator}
			style="position: relative; user-select: none;"
			class="relative bg-gray-200 h-1 w-full"
			on:click={seekTo}
		>
			<div class="  bg-missionnaire h-full touch-none" style="width: {progressBarWidth}%;" />
			<div
				class=" indicator absolute bg-missionnaire border-2 border-white ring-4 ring-missionnaire-100 w-5 h-5 rounded-full -top-2"
				style="left: {indicatorPosition}%; cursor: pointer;"
				on:mousedown={startDrag}
			/>
		</div>

		<div class="flex flex-row text-gray-500 space-x-1 text-base">
			<span class=" whitespace-nowrap">{formatTime(currentTime)} - {formatTime(duration)}</span>
		</div>
		<div class="hidden md:block">
			<button on:click={toggleMute} class=" text-missionnaire px-3 py-3 border space-x-11">
				{#if !isMuted}
					<Icon src={BsVolumeUpFill} />
				{/if}
				{#if isMuted}
					<Icon src={BsVolumeMuteFill} />
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
</style>
