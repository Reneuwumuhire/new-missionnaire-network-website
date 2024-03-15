<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import { getContext } from 'svelte';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import { formatDate, formatTime } from '../../utils/FormatTime';
	import Lazy from 'svelte-lazy';

	let selectedVideoToPlay: any = getContext('selectedVideo');
	let currentVideo: VideoItem;
	let playNow: Boolean = false;
	let videoId: string;

	$: selectedVideoToPlay.subscribe((video: VideoItem) => {
		currentVideo = video;
		videoId = video.id;
	});

	type VideoItem = {
		title: string;
		id: string;
		thumbnails?: {
			default: {
				url: string;
			};
			high: {
				url: string;
			};
			medium: {
				url: string;
			};
		};
		publishedAt?: any;
		scheduledStartTime?: any;
		description?: string;
		duration?: string;
		durationInSeconds: number;
	};
	// export let currentViewingUrl: VideoItem;
	// const handleClick = () => {
	// 	selectedVideoToPlay = currentViewingUrl;
	// };
</script>

<div class=" w-full flex items-center justify-center">
	<div class="flex w-full flex-row justify-between space-x-4">
		<!-- video and title -->
		<div class=" w-full">
			<div
				class=" relative w-full md:min-h-[600px] min-h-[100px] bg-hardBlack rounded-2xl md:rounded-3xl overflow-hidden"
			>
				{#if playNow && currentVideo}
					<div
						class=" flex flex-row items-center justify-center w-full rounded-xl overflow-hidden"
						id="player"
					>
						<iframe
							class=" w-full aspect-video rounded-xl"
							src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
							allowfullscreen
							allow="autoplay; encrypted-media"
							title=""
							allowtransparency
						/>
					</div>
				{/if}

				{#if !playNow}
					<!-- use the next div and place the background image -->
					<Lazy height={800} class=" bg-slate-100">
						<img
							class=" w-full h-full aspect-video object-cover object-center max-h-[600px]"
							src={currentVideo.thumbnails?.high.url}
							alt="thumbnail"
						/>
					</Lazy>
					<!-- play button in the middle of the div -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div
						on:click={() => {}}
						class="absolute flex flex-col justify-center mb-5 md:mb-0 items-center h-full w-full bottom-0 gradient cursor-pointer bg-gradient-to-t from-hardBlack to-transparent hover:via-black transition-all duration-500 ease-in-out"
					>
						<button
							on:click={() => {
								playNow = true;
								console.log('playNow is', playNow);
								console.log('currentVideo is', currentVideo);
							}}
							class=" w-20 h-20 text-missionnaire"
						>
							<Icon size="5rem" src={BsPlayCircleFill} />
						</button>
					</div>
					<div
						class="absolute flex flex-col justify-end h-fit p-3 md:p-10 w-full bg-gradient-to-t from-hardBlack bottom-0"
					>
						<h2
							class="text-white font-bold text-sm md:text-3xl text-ellipsis overflow-hidden line-clamp-2 leading-5 md:leading-10"
						>
							{currentVideo.title}
						</h2>
						<div
							class="flex flex-row justify-between w-full max-w-xs text-xs md:text-sm mt-1 md:mt-3"
						>
							<span class="text-grayWeak font-medium">
								{formatDate(currentVideo?.publishedAt)}
							</span>
							<span class="text-grayWeak font-medium">
								{formatTime(currentVideo.durationInSeconds)}
							</span>
						</div>
						<!-- <div class="xsm:mt-3 sm:mt-10 xsm:mb-5 lg:mb-10 flex gap-10">
							<button on:click={() => {}}>
								<img
									class=" xsm:w-[30px] lg:w-[45px] h-fit"
									src="/icons/play-yellow.png"
									alt="play"
								/>
							</button>
							<button>
								<img class=" xsm:w-[30px] w-[45px] h-fit" src="/icons/link-yellow.png" alt="play" />
							</button>
							<button>
								<img
									class=" xsm:w-[30px] w-[45px] h-fit"
									src="/icons/download-yellow.png"
									alt="play"
								/>
							</button>
						</div> -->
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
