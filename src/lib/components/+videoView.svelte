<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import { formatDate } from '../../utils/FormatTime';

	let selectedVideoToPlay: string = '';
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
		description?: string;
		duration?: string;
	};
	const handleClick = () => {
		selectedVideoToPlay = `https://www.youtube.com/embed/${currentViewingUrl.id}`;
	};
	export let currentViewingUrl: VideoItem;
</script>

<div class=" w-full flex items-center justify-center">
	<div class="flex w-full flex-row justify-between space-x-4">
		<!-- video and title -->
		<div class=" w-full">
			<div
				class=" relative w-full md:min-h-[600px] min-h-[100px] bg-hardBlack rounded-2xl md:rounded-3xl overflow-hidden"
			>
				{#if selectedVideoToPlay.length}
					<div
						class=" flex flex-row items-center justify-center w-full rounded-xl overflow-hidden"
						id="player"
					>
						<iframe
							class=" w-full aspect-video rounded-xl"
							src={`${selectedVideoToPlay}`}
							allowfullscreen
							allow="autoplay"
							title=""
							allowtransparency
						/>
					</div>
				{:else}
					<!-- use the next div and place the background image -->
					<img
						class=" w-full h-full aspect-video object-cover object-center max-h-[600px]"
						src={currentViewingUrl.thumbnails?.high.url}
						alt="thumbnail"
					/>
					<!-- play button in the middle of the div -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div
						on:click={handleClick}
						class="absolute flex flex-col justify-center mb-5 md:mb-0 items-center h-full w-full bottom-0 gradient cursor-pointer bg-gradient-to-t from-hardBlack to-transparent hover:via-black transition-all duration-500 ease-in-out"
					>
						<button on:click={handleClick} class=" w-20 h-20 text-missionnaire">
							<Icon size="5rem" src={BsPlayCircleFill} />
						</button>
					</div>
					<div
						class="absolute flex flex-col justify-end h-fit p-3 md:p-10 w-full bg-gradient-to-t from-hardBlack bottom-0"
					>
						<h2
							class="text-white font-bold text-sm md:text-3xl text-ellipsis overflow-hidden line-clamp-2 leading-5 md:leading-10"
						>
							{currentViewingUrl.title}
						</h2>
						<div
							class="flex flex-row justify-between w-full max-w-xs text-xs md:text-sm mt-1 md:mt-3"
						>
							<span class="text-grayWeak font-medium">
								{formatDate(currentViewingUrl?.publishedAt)}
							</span>
							<span class="text-grayWeak font-medium">120 min</span>
						</div>
						<!-- <div class="xsm:mt-3 sm:mt-10 xsm:mb-5 lg:mb-10 flex gap-10">
							<button on:click={handleClick}>
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
